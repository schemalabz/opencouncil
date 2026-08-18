import { z } from "zod";
import { decideDelivery } from "@/agent/delivery";
import { runWake } from "@/agent/runWake";
import { primaryEvent, wakeEventSchema } from "@/agent/schemas";
import type { TemplateName } from "@/agent/templates";
import { CityPreference, Deps, JOURNAL_WINDOW, JournalEntry, WakeEvent } from "@/agent/types";
import type { NotisSubscription, Prisma, PrismaClient } from "../../generated/client";
import { clampToActiveHours, isQuietHour } from "./active-hours";
import { alert as sendAlert } from "./alert";
import { BirdLike, realBird } from "./bird";
import { buildDeps } from "./deps";
import { hasNotisDb, notisDb } from "./db";
import { citiesForUser } from "./fanout";
import { hasMainDb } from "./main-db";
import {
  ClaimLostError,
  ClaimedItem,
  MAX_ATTEMPTS,
  claimNext,
  completeItem,
  deferItem,
  failItem,
  markFailed,
} from "./queue-core";
import { getProactiveSettings } from "./settings";

/**
 * The live-lane drainer: claim → assemble state → runWake → persist → send.
 *
 * Ordering invariants (PRD §4):
 * - runWake is pure; every side effect happens here.
 * - The NotisWake row, journal entry, profile/subscription deltas and the
 *   queue item's `done` all commit in ONE transaction BEFORE Bird is called:
 *   once the model has run, a retry must never run it again.
 * - Bird sends happen after that commit, each with an idempotency key (the
 *   message row's id — allocated with the wake, stable across retries), so
 *   a crash between commit and send is retried by the sweeper without a
 *   double delivery.
 */

export interface DrainDeps {
  deps?: Deps;
  bird?: BirdLike;
  db?: PrismaClient;
  alert?: (message: string) => Promise<void>;
}

export interface DrainResult {
  processed: number;
  failed: number;
}

/** Outbound messages still `pending` after this long get re-sent by the
 *  sweeper — covers a crash between the persist commit and the Bird call. */
export const RESEND_STALE_AFTER_MS = 2 * 60_000;

// Safety valve for one drain call, not a queue limit — the sweeper runs
// every minute, so leftovers are picked up immediately.
const MAX_ITEMS_PER_DRAIN = 50;

const eventsSchema = z.array(wakeEventSchema).min(1);

/** How long a paused item sleeps before the claim looks at it again. */
export const PAUSE_DEFER_MS = 15 * 60_000;
/** Claim-time margin: a wake this close to quiet hours defers instead of
 *  racing the boundary with a 30-60s model run. */
const QUIET_MARGIN_MS = 10 * 60_000;
/** The hard rail: at most this many unprompted messages per rolling week. */
export const WEEKLY_CAP = 3;
const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Reactive = the reader spoke; bypasses every rail. */
export function isReactiveWake(events: WakeEvent[]): boolean {
  return events.some((e) => e.type === "user_message");
}

/** Cap-countable (unprompted): not reactive, and not purely a promised
 *  follow-up to a reader question. A mixed coalesced wake counts,
 *  conservatively. */
export function isCapCountable(events: WakeEvent[]): boolean {
  if (isReactiveWake(events)) return false;
  const allReplyFollowups = events.every(
    (e) => e.type === "scheduled" && (e.origin ?? "reply") === "reply",
  );
  return !allReplyFollowups;
}

function resolveAlert(overrides: DrainDeps) {
  return overrides.alert ?? ((message: string) => sendAlert("queue", message));
}

/**
 * The reader's cities, live from the view. No main database configured is a
 * deliberate dev mode and yields none; a configured database that is
 * unreachable is an outage and throws, failing the item into a retry. The
 * alternative — waking with an empty list — spends a model call to tell the
 * agent this reader follows nothing, then completes as success: the brief is
 * consumed, `done` is terminal, and nothing re-delivers it once the database
 * is back.
 */
async function assembleCities(sub: NotisSubscription): Promise<CityPreference[]> {
  if (!hasMainDb()) return [];
  return citiesForUser(sub.userId);
}

async function runOneWake(
  db: PrismaClient,
  item: ClaimedItem,
  sub: NotisSubscription,
  events: WakeEvent[],
  overrides: DrainDeps,
): Promise<void> {
  const alert = resolveAlert(overrides);
  const deps = overrides.deps ?? buildDeps();
  const bird = overrides.bird ?? realBird;
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const primary = primaryEvent(ordered);
  const lastAt = ordered[ordered.length - 1].at;
  const reactive = isReactiveWake(ordered);
  const capCountable = isCapCountable(ordered);

  const journalRows = await db.notisJournalEntry.findMany({
    where: { subscriptionId: sub.id },
    orderBy: { seq: "desc" },
    take: JOURNAL_WINDOW,
  });
  const journal = journalRows.reverse().map((row) => row.entry as unknown as JournalEntry);

  const lastInbound = await db.notisMessage.findFirst({
    where: { subscriptionId: sub.id, direction: "inbound" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const cities = await assembleCities(sub);
  const state = {
    user: { name: sub.userName ?? "", cities },
    profile: sub.profileText,
    journal,
  };

  // The wall clock, not the events' timestamps: this wake may have waited
  // out quiet hours or a pause since they were recorded.
  const { outcome, trace } = await runWake(state, ordered, deps, { now: new Date() });

  // The primary event picks the shell; the 24h window is judged at the SEND
  // moment, which is now — never at the event's timestamp. A meeting event
  // carries its completedAt, and the quiet-hours clamp or a pause deferral
  // can put hours or days between the two: judging at the event time picks
  // freeform for a window that closed in between, and a rejected freeform
  // send has no SMS fallback (that covers template rows only).
  const delivery =
    outcome.messages.length > 0
      ? decideDelivery(primary, lastInbound?.createdAt.toISOString(), new Date())
      : undefined;

  const unparseableSchedules: string[] = [];
  const outboundIds = await db.$transaction(async (tx) => {
    const { _max } = await tx.notisJournalEntry.aggregate({
      where: { subscriptionId: sub.id },
      _max: { seq: true },
    });

    const wake = await tx.notisWake.create({
      data: {
        subscriptionId: sub.id,
        eventType: primary.type,
        eventAt: new Date(lastAt),
        event: primary as unknown as Prisma.InputJsonValue,
        // The full array only when the wake coalesced several events.
        events:
          ordered.length > 1 ? (ordered as unknown as Prisma.InputJsonValue) : undefined,
        decision: outcome.decision,
        rationale: outcome.rationale,
        outcome: outcome as unknown as Prisma.InputJsonValue,
        deliveryMode: delivery?.mode,
        deliveryTemplate: delivery?.mode === "template" ? delivery.template : undefined,
        repairs: outcome.repairs ?? [],
        truncated: outcome.truncated ?? false,
        finishWakeMissing: outcome.finishWakeMissing ?? false,
        model: deps.config.model,
        inputTokens: trace.usageTotal.input,
        outputTokens: trace.usageTotal.output,
        cacheReadTokens: trace.usageTotal.cacheRead,
        cacheWriteTokens: trace.usageTotal.cacheWrite,
        cacheWrite1hTokens: trace.usageTotal.cacheWrite1h ?? null,
        costUsd: trace.costUsd,
        durationMs: trace.durationMs,
        trace: trace as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await tx.notisJournalEntry.create({
      data: {
        subscriptionId: sub.id,
        wakeId: wake.id,
        seq: (_max.seq ?? 0) + 1,
        entry: outcome.journalAppend as unknown as Prisma.InputJsonValue,
      },
    });

    // Always touched: updatedAt is the conversation list's activity sort key.
    const subData: Prisma.NotisSubscriptionUpdateInput = { updatedAt: new Date() };
    if (outcome.profileRewrite !== undefined) subData.profileText = outcome.profileRewrite;
    // Only the user moves a row into `unsubscribed` — and unsubscribe_user
    // fires only on a user_message wake, so this is the user doing it.
    if (outcome.unsubscribe && sub.status !== "unsubscribed") {
      subData.status = "unsubscribed";
      subData.unsubscribedAt = new Date(lastAt);
    }
    await tx.notisSubscription.update({ where: { id: sub.id }, data: subData });

    for (const scheduled of outcome.scheduledWakes) {
      // The instant is model-written, so it is parsed defensively: an
      // unparseable one would otherwise throw inside this transaction and
      // roll back a wake whose model run is already paid for.
      const runAfter = new Date(scheduled.at);
      if (Number.isNaN(runAfter.getTime())) {
        unparseableSchedules.push(scheduled.at);
        continue;
      }
      // The poller fires these. Origin decides the eventual template shell
      // and the cap exemption: a schedule made while answering the reader
      // is a promised reply; one made after proactive news is not.
      await tx.notisScheduledWake.create({
        data: {
          subscriptionId: sub.id,
          runAfter,
          reason: scheduled.reason,
          origin: reactive ? "reply" : "proactive",
        },
      });
    }

    const ids: string[] = [];
    for (const text of outcome.messages) {
      const message = await tx.notisMessage.create({
        data: {
          subscriptionId: sub.id,
          wakeId: wake.id,
          direction: "outbound",
          body: text,
          channel: "whatsapp",
          proactive: capCountable,
          deliveryMode: delivery?.mode,
          template: delivery?.mode === "template" ? delivery.template : undefined,
          status: "pending",
        },
        select: { id: true },
      });
      ids.push(message.id);
    }

    // The claim fence: if the item was reclaimed while the model ran,
    // abort the whole transaction — nothing of this run may land.
    const owned = await completeItem(tx, item.id, item.attempts);
    if (!owned) throw new ClaimLostError(item.id);
    return ids;
  });

  for (const at of unparseableSchedules) {
    await alert(`wake for ${sub.id} scheduled an unparseable instant (${at}) — note dropped`);
  }

  if (outboundIds.length === 0) return;

  if (reactive) {
    // A reply bypasses every rail — it goes out at 03:00 if the reader
    // texted at 03:00, and decideDelivery guarantees freeform.
    await sendPendingMessages(db, bird, outboundIds, sub, alert);
    return;
  }

  await sendProactiveMessages(db, bird, outboundIds, sub, alert);
}

/** Record a Bird send result on the message row: sent, stay-pending
 *  (transient — the sweeper retries under the same idempotency key), or
 *  terminal failed with an alert. */
async function applySendResult(
  db: PrismaClient,
  id: string,
  result: { success: boolean; messageId?: string; retryable?: boolean; error?: string },
  alert: (message: string) => Promise<void>,
): Promise<void> {
  if (result.success) {
    await db.notisMessage.update({
      where: { id },
      data: { status: "sent", birdMessageId: result.messageId },
    });
  } else if (result.retryable) {
    // Transient (network, 5xx): the row STAYS pending so the sweeper
    // retries it under the same idempotency key once Bird recovers. The
    // sweeper gives up — and alerts — after RESEND_GIVE_UP_MS.
    await db.notisMessage.update({
      where: { id },
      data: { failureReason: (result.error ?? "unknown error").slice(0, 300) },
    });
    console.warn(`[notis:queue] transient Bird failure for message ${id}, will retry:`, result.error);
  } else {
    await db.notisMessage.update({
      where: { id },
      data: { status: "failed", failureReason: (result.error ?? "unknown error").slice(0, 300) },
    });
    await alert(`Bird send failed for message ${id}: ${result.error ?? "unknown error"}`);
  }
}

/** The rails' own vocabulary, Greek names included — one closed set shared
 *  by the writer, the journal correction and the panel. */
export const SUPPRESSION_REASONS = {
  unsubscribed: "απεγγραφή",
  paused: "παύση",
  "weekly cap": "όριο εβδομάδας",
} as const;

export type SuppressionReason = keyof typeof SUPPRESSION_REASONS;

/** Append a `system` journal entry. The agent reads the journal as the
 *  record of what this reader has actually been told, so anything that
 *  contradicts an earlier entry has to land here. */
async function appendSystemEntry(
  db: PrismaClient,
  subscriptionId: string,
  rationale: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  const { _max } = await client.notisJournalEntry.aggregate({
    where: { subscriptionId },
    _max: { seq: true },
  });
  await client.notisJournalEntry.create({
    data: {
      subscriptionId,
      seq: (_max.seq ?? 0) + 1,
      entry: {
        at: new Date().toISOString(),
        event: "system",
        decision: "silence",
        rationale,
        messages: [],
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function suppressMessages(
  db: PrismaClient,
  messageIds: string[],
  reason: SuppressionReason,
): Promise<void> {
  if (messageIds.length === 0) return;
  const rows = await db.notisMessage.findMany({
    where: { id: { in: messageIds }, status: "pending" },
    select: { id: true, subscriptionId: true },
  });
  if (rows.length === 0) return;

  await db.notisMessage.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, status: "pending" },
    data: { status: "suppressed", failureReason: reason },
  });

  // The wake's journal entry recorded these texts as sent — it commits
  // inside the persist transaction, before any rail runs. Left uncorrected,
  // the agent reads its own memory as proof the reader saw them: it dedups
  // the story on later wakes and can refer back to a message that never
  // arrived. The correction is append-only, like the rest of the journal.
  const bySubscription = new Map<string, number>();
  for (const row of rows) {
    bySubscription.set(row.subscriptionId, (bySubscription.get(row.subscriptionId) ?? 0) + 1);
  }
  for (const [subscriptionId, count] of bySubscription) {
    const what =
      count === 1
        ? "Το προηγούμενο μήνυμα δεν στάλθηκε"
        : `Τα ${count} προηγούμενα μηνύματα δεν στάλθηκαν`;
    await appendSystemEntry(
      db,
      subscriptionId,
      `(σύστημα) ${what} — ${SUPPRESSION_REASONS[reason]}. Ο χρήστης ΔΕΝ τα έλαβε.`,
    );
  }
}

/**
 * Countable history for the weekly cap: unprompted rows from the rolling
 * week that reached or will reach the reader. Suppressed rows never arrived
 * and never count. Exported so the panel and the pre-model check measure
 * exactly what the send boundary enforces.
 */
export async function capUsage(
  db: PrismaClient,
  subscriptionId: string,
  excludeIds: string[] = [],
): Promise<number> {
  return db.notisMessage.count({
    where: {
      subscriptionId,
      proactive: true,
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      createdAt: { gte: new Date(Date.now() - WEEK_MS) },
      status: { in: ["pending", "sent", "delivered", "read"] },
    },
  });
}

/**
 * The live rails for one proactive row, re-read at the delivery instant:
 * the reader's current status and the kill switch. Both can flip during the
 * 30-60s model run, and the sweeper's retry can arrive an hour after the
 * row was written.
 */
async function proactiveBlockReason(
  db: PrismaClient,
  subscriptionId: string,
): Promise<SuppressionReason | null> {
  const [current, settings] = await Promise.all([
    db.notisSubscription.findUnique({
      where: { id: subscriptionId },
      select: { status: true },
    }),
    getProactiveSettings(db),
  ]);
  if (!current || current.status === "unsubscribed") return "unsubscribed";
  if (settings.paused) return "paused";
  return null;
}

/** Send `pending` outbound rows into the subscription's conversation. Also
 *  used by the webhook's deterministic ΣΤΟΠ replies. Free-form only —
 *  reactive replies and in-window sends; templates ride
 *  sendProactiveMessages. */
export async function sendPendingMessages(
  db: PrismaClient,
  bird: BirdLike,
  messageIds: string[],
  sub: Pick<NotisSubscription, "id" | "birdConversationId">,
  alert: (message: string) => Promise<void>,
): Promise<void> {
  if (!sub.birdConversationId) {
    await db.notisMessage.updateMany({
      where: { id: { in: messageIds } },
      data: { status: "failed", failureReason: "no birdConversationId on subscription" },
    });
    await alert(`subscription ${sub.id} has no birdConversationId — cannot deliver replies`);
    return;
  }

  for (const id of messageIds) {
    const message = await db.notisMessage.findUnique({ where: { id } });
    if (!message || message.status !== "pending") continue;

    const result = await bird.sendText({
      conversationId: sub.birdConversationId,
      text: message.body,
      idempotencyKey: message.id,
    });
    await applySendResult(db, id, result, alert);
  }
}

/**
 * Deliver ONE pending outbound row, honoring its delivery mode. Template
 * sends with no conversation yet bootstrap one (the cold first contact);
 * the returned conversation id is persisted so every later send reuses it.
 *
 * This is the single delivery choke point, so the rails that must hold at
 * the delivery instant live HERE rather than at one call site: the row's own
 * `proactive` flag decides whether they apply, and every caller — the send
 * boundary, the sweeper's stale-row retry, the poller's enrollment intro —
 * inherits them. The boundary alone was not enough: a transiently failed
 * proactive row stays pending by design, and the sweeper would re-send it
 * up to an hour later, long after a ΣΤΟΠ or a flipped kill switch.
 */
export async function deliverPendingMessage(
  db: PrismaClient,
  bird: BirdLike,
  messageId: string,
  sub: Pick<NotisSubscription, "id" | "phone" | "userName" | "birdConversationId">,
  alert: (message: string) => Promise<void>,
): Promise<void> {
  const message = await db.notisMessage.findUnique({ where: { id: messageId } });
  if (!message || message.status !== "pending") return;

  if (message.proactive) {
    const blocked = await proactiveBlockReason(db, sub.id);
    if (blocked) {
      await suppressMessages(db, [messageId], blocked);
      return;
    }
  }

  if (message.deliveryMode !== "template") {
    await sendPendingMessages(db, bird, [messageId], sub, alert);
    return;
  }

  const template = message.template as TemplateName;
  // Every template send names its recipient, so a row without a phone is a
  // failure on both paths, not just the cold one.
  if (!sub.phone) {
    await applySendResult(
      db,
      messageId,
      { success: false, retryable: false, error: "no phone on subscription for a template send" },
      alert,
    );
    return;
  }

  if (sub.birdConversationId) {
    const result = await bird.sendTemplate({
      conversationId: sub.birdConversationId,
      phone: sub.phone,
      template,
      text: message.body,
      idempotencyKey: message.id,
    });
    await applySendResult(db, messageId, result, alert);
    return;
  }
  const created = await bird.createConversationWithTemplate({
    phone: sub.phone,
    name: `Notis ${sub.userName ?? sub.phone}`,
    template,
    text: message.body,
    idempotencyKey: message.id,
  });
  if (created.alreadyExisted && created.conversationId) {
    // Bird already had a conversation for this phone: adopt it, send into it.
    await db.notisSubscription.update({
      where: { id: sub.id },
      data: { birdConversationId: created.conversationId },
    });
    const result = await bird.sendTemplate({
      conversationId: created.conversationId,
      phone: sub.phone,
      template,
      text: message.body,
      idempotencyKey: message.id,
    });
    await applySendResult(db, messageId, result, alert);
    return;
  }
  if (created.success && created.conversationId) {
    await db.notisSubscription.update({
      where: { id: sub.id },
      data: { birdConversationId: created.conversationId },
    });
  }
  if (created.success && !created.messageId) {
    // Without a message id the delivery-status webhooks cannot find this
    // row: it stays `sent` whatever happens, and a failure never reaches
    // the SMS fallback. Rare, and worth knowing about.
    await alert(
      `cold send ${messageId} got no Bird message id — delivery status for it cannot be tracked`,
    );
  }
  await applySendResult(db, messageId, created, alert);
}

/**
 * The proactive send boundary — the rails in order, per PRD §6:
 * unsubscribed race → kill switch → weekly cap → send. Suppressions land
 * as status `suppressed` with the reason in failureReason, so the panel
 * shows exactly what a rail stopped and why.
 *
 * The unsubscribed and paused rails are enforced per row inside
 * deliverPendingMessage against live state; the batch-level checks here read
 * the same state once so a whole wake short-circuits with a single alert
 * instead of per message. The weekly cap belongs here, where the batch is
 * visible: the rows of one wake share the remaining budget.
 */
export async function sendProactiveMessages(
  db: PrismaClient,
  bird: BirdLike,
  messageIds: string[],
  sub: NotisSubscription,
  alert: (message: string) => Promise<void>,
): Promise<void> {
  if (messageIds.length === 0) return;

  // Rails 0 and 1, re-read: the reader may have unsubscribed, or the switch
  // may have flipped, during the model run. `sub` was loaded before it.
  const blocked = await proactiveBlockReason(db, sub.id);
  if (blocked) {
    await suppressMessages(db, messageIds, blocked);
    if (blocked === "paused") {
      await alert(`proactive sends paused — suppressed ${messageIds.length} message(s) for ${sub.id}`);
    }
    return;
  }

  // The quiet-hours clamp lives at enqueue time; reaching the boundary
  // inside quiet hours is drift worth an alarm, but "never dropped"
  // outranks a minutes-wide overshoot — send anyway.
  if (isQuietHour(new Date())) {
    await alert(`proactive send for ${sub.id} reached the boundary inside quiet hours — sending anyway`);
  }

  const rows = await db.notisMessage.findMany({
    where: { id: { in: messageIds } },
    select: { id: true, proactive: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  // The weekly cap covers unprompted messages only. processItem checks it
  // before the model too; this pass catches the wake that filled the budget
  // while it ran.
  let remaining = Number.POSITIVE_INFINITY;
  if (rows.some((r) => r.proactive)) {
    remaining = Math.max(0, WEEKLY_CAP - (await capUsage(db, sub.id, messageIds)));
  }

  for (const id of messageIds) {
    const row = byId.get(id);
    if (!row) continue;
    if (row.proactive) {
      if (remaining <= 0) {
        await suppressMessages(db, [id], "weekly cap");
        continue;
      }
      remaining--;
    }
    await deliverPendingMessage(db, bird, id, sub, alert);
  }
}

/** Close a wake the weekly cap makes pointless, before any model spend. The
 *  events are consumed — a slot opens only as the week rolls, by which time
 *  this news is old — so the journal records what went unexamined. */
async function skipCappedWake(
  db: PrismaClient,
  item: ClaimedItem,
  eventCount: number,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const owned = await completeItem(tx, item.id, item.attempts);
    if (!owned) throw new ClaimLostError(item.id);
    const what =
      eventCount === 1 ? "Μία ενημέρωση δεν εξετάστηκε" : `${eventCount} ενημερώσεις δεν εξετάστηκαν`;
    await appendSystemEntry(
      db,
      item.subscriptionId,
      `(σύστημα) ${what} — ο χρήστης έχει ήδη ${WEEKLY_CAP} αυθόρμητα μηνύματα αυτή την εβδομάδα.`,
      tx,
    );
  });
}

export async function processItem(item: ClaimedItem, overrides: DrainDeps = {}): Promise<void> {
  const db = overrides.db ?? notisDb();
  const alert = resolveAlert(overrides);

  if (item.attempts > MAX_ATTEMPTS) {
    await markFailed(db, item.id, item.attempts, `gave up after ${MAX_ATTEMPTS} attempts`);
    await alert(`queue item ${item.id} failed terminally after ${MAX_ATTEMPTS} attempts`);
    return;
  }

  try {
    const events = eventsSchema.parse(item.events);

    // Pre-model rails for non-reactive wakes: a paused system spends no
    // model dollars, and a wake that would finish inside quiet hours is
    // deferred to the release instant instead of racing the boundary.
    // deferItem undoes the attempt, so deferral is never a retry.
    if (!isReactiveWake(events)) {
      const settings = await getProactiveSettings(db);
      if (settings.paused) {
        await deferItem(db, item.id, item.attempts, new Date(Date.now() + PAUSE_DEFER_MS));
        return;
      }
      const probe = new Date(Date.now() + QUIET_MARGIN_MS);
      const clamped = clampToActiveHours(probe);
      if (clamped.getTime() !== probe.getTime()) {
        await deferItem(db, item.id, item.attempts, clamped);
        return;
      }
      // The weekly cap, before the model for the same reason: a saturated
      // reader's unprompted wake can only produce messages the boundary
      // suppresses, so running it buys a journal entry the rails then have
      // to contradict — and pays for it. Reply-continuations are exempt.
      if (isCapCountable(events) && (await capUsage(db, item.subscriptionId)) >= WEEKLY_CAP) {
        await skipCappedWake(db, item, events.length);
        return;
      }
    }

    const sub = await db.notisSubscription.findUnique({ where: { id: item.subscriptionId } });
    if (!sub) {
      await markFailed(db, item.id, item.attempts, "subscription no longer exists");
      return;
    }
    await runOneWake(db, item, sub, events, overrides);
  } catch (error) {
    if (error instanceof ClaimLostError) {
      // A reclaiming worker owns the item now; this run's persist rolled
      // back before anything landed. Touch nothing.
      console.warn(`[notis:queue] ${error.message}`);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[notis:queue] item ${item.id} failed:`, error);
    // failItem is fenced on this claim (id + attempts + running), so a
    // throw AFTER the persist transaction committed — the send phase —
    // cannot resurrect a done item: the fence misses and the pending
    // messages are re-sent by the sweeper under their original
    // idempotency keys instead.
    await failItem(db, item.id, item.attempts, message);
  }
}

export async function drainQueue(overrides: DrainDeps = {}): Promise<DrainResult> {
  if (!overrides.db && !hasNotisDb()) return { processed: 0, failed: 0 };
  const db = overrides.db ?? notisDb();

  let processed = 0;
  let failed = 0;
  for (let i = 0; i < MAX_ITEMS_PER_DRAIN; i++) {
    const item = await claimNext(db);
    if (!item) break;
    await processItem(item, overrides);
    const after = await db.notisWakeQueue.findUnique({
      where: { id: item.id },
      select: { status: true, attempts: true },
    });
    if (after?.status === "done") processed++;
    // A deferral re-pended the item with its attempt undone — neither
    // processed nor failed, and not claimable again this drain (runAfter
    // moved into the future).
    else if (!(after?.status === "pending" && after.attempts === item.attempts - 1)) failed++;
  }
  return { processed, failed };
}

/** A pending message older than this is not worth delivering any more —
 *  mark it failed and alert instead of retrying forever. */
export const RESEND_GIVE_UP_MS = 60 * 60_000;

/** Marker on a pending SMS row the quiet-hours rail held back. The sweeper
 *  releases it after 09:00; the give-up pass leaves it alone until then. */
export const SMS_HELD_FOR_QUIET_HOURS = "held for quiet hours";

/**
 * Send one SMS the quiet-hours rail held overnight. The marker is cleared
 * first, in a fenced update: whichever sweep wins that row sends, and a
 * concurrent one finds nothing to claim. An SMS is never retried after
 * that — the channels API has no idempotency key, so a duplicate SMS is
 * worse than a lost fallback.
 */
async function releaseHeldSms(
  db: PrismaClient,
  bird: BirdLike,
  message: { id: string; body: string },
  phone: string | null,
  alert: (message: string) => Promise<void>,
): Promise<void> {
  if (!phone) return;
  const claimed = await db.notisMessage.updateMany({
    where: { id: message.id, status: "pending", failureReason: SMS_HELD_FOR_QUIET_HOURS },
    data: { failureReason: null },
  });
  if (claimed.count !== 1) return;

  const result = await bird.sendSms({ phone, text: message.body });
  if (result.success) {
    await db.notisMessage.update({
      where: { id: message.id },
      data: { status: "sent", birdMessageId: result.messageId },
    });
    return;
  }
  await db.notisMessage.update({
    where: { id: message.id },
    data: { status: "failed", failureReason: (result.error ?? "unknown error").slice(0, 300) },
  });
  await alert(`held SMS ${message.id} failed on release: ${result.error ?? "unknown error"}`);
}

/**
 * Sweeper half two: re-send outbound messages stuck in `pending` — a crash
 * between the persist commit and the Bird call, or a transient Bird failure
 * that left the row pending on purpose. The idempotency key (the message
 * id) makes the re-send safe even if the original went out. Rows pending
 * for over an hour stop retrying: a WhatsApp reply that late is noise, and
 * unbounded retries would hide a broken Bird integration.
 */
export async function resendStalePendingMessages(overrides: DrainDeps = {}): Promise<number> {
  if (!overrides.db && !hasNotisDb()) return 0;
  const db = overrides.db ?? notisDb();
  const bird = overrides.bird ?? realBird;
  const alert = resolveAlert(overrides);

  const stale = await db.notisMessage.findMany({
    where: {
      direction: "outbound",
      status: "pending",
      createdAt: { lt: new Date(Date.now() - RESEND_STALE_AFTER_MS) },
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      channel: true,
      failureReason: true,
      subscription: {
        select: { id: true, phone: true, userName: true, birdConversationId: true },
      },
    },
    take: 50,
  });

  const giveUpBefore = Date.now() - RESEND_GIVE_UP_MS;
  for (const message of stale) {
    const held =
      message.channel === "sms" && message.failureReason === SMS_HELD_FOR_QUIET_HOURS;
    // A held row is waiting on the clock, not on Bird — the hour it spends
    // between 23:00 and 09:00 must not age it out.
    if (!held && message.createdAt.getTime() < giveUpBefore) {
      await db.notisMessage.update({
        where: { id: message.id },
        data: { status: "failed", failureReason: "gave up after 1h of delivery retries" },
      });
      await alert(`message ${message.id}: undeliverable for over an hour — giving up`);
      continue;
    }
    // SMS rows are never re-sent: the channels API has no idempotency key,
    // and a duplicate SMS is worse than a lost fallback. They age out via
    // the give-up pass above. The one exception is a row that never went
    // out at all because quiet hours held it — this is its 09:00 release.
    if (message.channel === "sms") {
      if (held && !isQuietHour(new Date())) {
        await releaseHeldSms(db, bird, message, message.subscription.phone, alert);
      }
      continue;
    }
    await deliverPendingMessage(db, bird, message.id, message.subscription, alert);
  }
  return stale.length;
}
