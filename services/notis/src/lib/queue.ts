import { z } from "zod";
import { decideDelivery } from "@/agent/delivery";
import { runWake } from "@/agent/runWake";
import { primaryEvent, wakeEventSchema } from "@/agent/schemas";
import type { TemplateName } from "@/agent/templates";
import {
  CityPreference,
  CONVERSATION_WINDOW,
  Deps,
  DECISION_WINDOW,
  DecisionEntry,
  WakeEvent,
} from "@/agent/types";
import type { NotisSubscription, Prisma, PrismaClient } from "../../generated/client";
import { clampToActiveHours, isQuietHour } from "./active-hours";
import { alert as sendAlert } from "./alert";
import { BirdLike, SEND_TIMEOUT_MS, realBird } from "./bird";
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
 * - The NotisWake row, profile/subscription deltas and the queue item's
 *   `done` all commit in ONE transaction BEFORE Bird is called:
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

/** How long a send claim (`sendingAt`) is honored before another worker may
 *  re-claim the row. Above the worst-case send: the cold template path makes
 *  two sequential Bird calls, each capped at SEND_TIMEOUT_MS. The send
 *  boundary and the sweeper both claim through this, so one row is never sent
 *  twice under its idempotency key while a slow send is still in flight. */
const SEND_CLAIM_TTL_MS = 2 * SEND_TIMEOUT_MS + 30_000;

/** The persist transaction's budget. It holds the subscription's row lock —
 *  the same lock every inbound webhook for that reader waits on — so it needs
 *  room for contention, not just for its own writes. */
const PERSIST_TIMEOUT_MS = 30_000;

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

  // The decision log comes from the wake records themselves — one row per
  // wake, including the shell's own model-less decisions (a ΣΤΟΠ pre-step, a
  // cap skip). eventAt orders on the world's timeline; id breaks same-instant
  // ties in insertion order.
  const wakeRows = await db.notisWake.findMany({
    where: { subscriptionId: sub.id },
    orderBy: [{ eventAt: "desc" }, { id: "desc" }],
    take: DECISION_WINDOW,
    select: { eventType: true, eventAt: true, decision: true, rationale: true, outcome: true, truncated: true },
  });
  const decisions: DecisionEntry[] = wakeRows.reverse().map((row) => {
    const o = row.outcome as { profileRewrite?: string; unsubscribe?: unknown } | null;
    return {
      at: row.eventAt.toISOString(),
      event: row.eventType as DecisionEntry["event"],
      decision: row.decision,
      rationale: row.rationale,
      ...(o?.profileRewrite !== undefined ? { profileRewritten: true } : {}),
      ...(o?.unsubscribe ? { unsubscribed: true } : {}),
      ...(row.truncated ? { truncated: true } : {}),
    };
  });

  const lastInbound = await db.notisMessage.findFirst({
    where: { subscriptionId: sub.id, direction: "inbound" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  // The conversation the agent sees is the real message record: inbound
  // messages, and outbound messages that actually reached the reader. A
  // suppressed or failed send is excluded, so the agent never treats a
  // stopped message as delivered — the delivery status is the source of
  // truth, not a claim written before the send.
  const messageRows = await db.notisMessage.findMany({
    where: {
      subscriptionId: sub.id,
      OR: [
        { direction: "inbound" },
        { direction: "outbound", status: { in: ["sent", "delivered", "read"] } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CONVERSATION_WINDOW,
    select: { direction: true, body: true, createdAt: true },
  });
  const conversation = messageRows.reverse().map((m) => ({
    at: m.createdAt.toISOString(),
    from: m.direction === "inbound" ? ("reader" as const) : ("notis" as const),
    text: m.body,
  }));

  const cities = await assembleCities(sub);
  const state = {
    user: { name: sub.userName ?? "", cities },
    profile: sub.profileText,
    conversation,
    decisions,
  };

  // Incremental delivery, reactive wakes only: someone is waiting and no
  // rail applies to a reply, so each send goes out the moment the model
  // writes it. The row is created wakeId-less here and adopted by the wake
  // row at persistence; a row the send left pending is the sweeper's to
  // finish. The batch lane (and every deliver-less caller: playground,
  // dry-run, fixtures) keeps batch delivery at the boundary.
  const incrementalIds: string[] = [];
  const wakeDeps: Deps = reactive
    ? {
        ...deps,
        deliver: async (text: string) => {
          const message = await db.notisMessage.create({
            data: {
              subscriptionId: sub.id,
              direction: "outbound",
              body: text,
              channel: "whatsapp",
              proactive: capCountable,
              deliveryMode: "freeform",
              status: "pending",
            },
            select: { id: true },
          });
          incrementalIds.push(message.id);
          try {
            await deliverPendingMessage(db, bird, message.id, sub, alert);
          } catch (error) {
            return {
              ok: false,
              detail: error instanceof Error ? error.message : String(error),
            };
          }
          const after = await db.notisMessage.findUnique({
            where: { id: message.id },
            select: { status: true, failureReason: true },
          });
          return after?.status === "sent"
            ? { ok: true }
            : {
                ok: false,
                detail: after?.failureReason ?? `status: ${after?.status ?? "unknown"}`,
              };
        },
      }
    : deps;

  // The wall clock, not the events' timestamps: this wake may have waited
  // out quiet hours or a pause since they were recorded.
  const { outcome, trace } = await runWake(state, ordered, wakeDeps, { now: new Date() });

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
  const outboundIds = await db.$transaction(
    async (tx) => {
    // updatedAt is always touched: it is the conversation list's activity
    // sort key. (The update also serializes concurrent writers of this
    // subscription on its row lock — the ΣΤΟΠ path touches the same row.)
    const subData: Prisma.NotisSubscriptionUpdateInput = { updatedAt: new Date() };
    if (outcome.profileRewrite !== undefined) subData.profileText = outcome.profileRewrite;
    // Only the user moves a row into `unsubscribed` — and unsubscribe_user
    // fires only on a user_message wake, so this is the user doing it.
    if (outcome.unsubscribe && sub.status !== "unsubscribed") {
      subData.status = "unsubscribed";
      subData.unsubscribedAt = new Date(lastAt);
    }
    await tx.notisSubscription.update({ where: { id: sub.id }, data: subData });

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
    if (incrementalIds.length > 0) {
      // The rows already exist (created mid-loop, delivered or left to the
      // sweeper) — adopt them, so the panel's wakeId alignment holds.
      await tx.notisMessage.updateMany({
        where: { id: { in: incrementalIds } },
        data: { wakeId: wake.id },
      });
    } else {
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
    }

    // The claim fence: if the item was reclaimed while the model ran,
    // abort the whole transaction — nothing of this run may land.
    const owned = await completeItem(tx, item.id, item.attempts);
    if (!owned) throw new ClaimLostError(item.id);
    return ids;
    },
    // Prisma's default is 5s, and this transaction holds the subscription's
    // row lock while every inbound webhook for the same reader waits on it.
    // Blowing the budget rolls back a run the model was already paid for.
    // P2028 also does not fire at the deadline — Prisma notices on the next
    // query — so a long lock wait blocks for its full duration, then dies.
    { timeout: PERSIST_TIMEOUT_MS },
  ).catch(async (error: unknown) => {
    // The record rolls back; incremental sends do not. A claim lost after
    // real deliveries means the reclaimer will run the model again and may
    // answer again — rare (this wake outlived STALE_CLAIM_MS), and the
    // re-run's state assembly sees the sent rows, but the operator should
    // know it happened.
    if (error instanceof ClaimLostError && incrementalIds.length > 0) {
      await alert(
        `wake for ${sub.id} lost its claim after ${incrementalIds.length} incremental ` +
          "deliveries — the reclaimer may answer again",
      );
    }
    throw error;
  });

  for (const at of unparseableSchedules) {
    await alert(`wake for ${sub.id} scheduled an unparseable instant (${at}) — note dropped`);
  }

  if (outcome.partialDeliveryError) {
    await alert(
      `wake for ${sub.id} finalized after a partial delivery ` +
        `(${incrementalIds.length} rows): ${outcome.partialDeliveryError}`,
    );
  }

  if (outboundIds.length === 0) return;

  if (reactive) {
    // A reply bypasses every rail — it goes out at 03:00 if the reader
    // texted at 03:00, and decideDelivery guarantees freeform. (With
    // incremental delivery the sends already happened mid-loop and
    // outboundIds is empty; this path is the deliver-less fallback.)
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
      data: {
        status: "sent",
        birdMessageId: result.messageId,
        // The outcome is known, so release the claim rather than make the
        // next sweep wait out its staleness window.
        sendingAt: null,
        // A failureReason from an earlier attempt is history now; leaving it
        // shows a delivered message with an error beside it in the panel.
        failureReason: null,
      },
    });
  } else if (result.retryable) {
    // Transient (network, 5xx): the row STAYS pending so the sweeper
    // retries it under the same idempotency key once Bird recovers. The
    // sweeper gives up — and alerts — after RESEND_GIVE_UP_MS.
    await db.notisMessage.update({
      where: { id },
      data: {
        failureReason: (result.error ?? "unknown error").slice(0, 300),
        sendingAt: null,
      },
    });
    console.warn(`[notis:queue] transient Bird failure for message ${id}, will retry:`, result.error);
  } else {
    await db.notisMessage.update({
      where: { id },
      data: {
        status: "failed",
        failureReason: (result.error ?? "unknown error").slice(0, 300),
        sendingAt: null,
      },
    });
    await alert(`Bird send failed for message ${id}: ${result.error ?? "unknown error"}`);
  }
}

/** The rails' own vocabulary, Greek names included — one closed set shared
 *  by the writer and the panel. */
export const SUPPRESSION_REASONS = {
  unsubscribed: "απεγγραφή",
  paused: "παύση",
  "weekly cap": "όριο εβδομάδας",
} as const;

export type SuppressionReason = keyof typeof SUPPRESSION_REASONS;

export async function suppressMessages(
  db: PrismaClient,
  messageIds: string[],
  reason: SuppressionReason,
): Promise<void> {
  if (messageIds.length === 0) return;
  // Flip the rows to `suppressed`. No correction is needed anywhere: the
  // agent reads the conversation from the real message record (see the state
  // assembly in runOneWake), and a suppressed row is excluded there, so it
  // can never be mistaken for a delivered message. The reason lives on the
  // row for the panel; SUPPRESSION_REASONS still labels it there.
  await db.notisMessage.updateMany({
    where: { id: { in: messageIds }, status: "pending" },
    data: { status: "suppressed", failureReason: reason },
  });
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

/**
 * Fence one pending row for sending: the first caller wins and stamps
 * `sendingAt`; a concurrent one — the send boundary racing the sweeper, or
 * two overlapping sweeps — gets false and leaves the row alone, so Bird never
 * receives two requests for one row under the same idempotency key. Every
 * send path claims through here, so the fence is not the sweeper's alone.
 */
async function claimForSend(db: PrismaClient, messageId: string): Promise<boolean> {
  const now = Date.now();
  const claimed = await db.notisMessage.updateMany({
    where: {
      id: messageId,
      status: "pending",
      OR: [{ sendingAt: null }, { sendingAt: { lt: new Date(now - SEND_CLAIM_TTL_MS) } }],
    },
    data: { sendingAt: new Date(now) },
  });
  return claimed.count === 1;
}

/** Send one free-form row into the existing conversation. Free-form is only
 *  deliverable inside the 24h window, so the conversation already exists; a
 *  row without one is a failure. The caller has already claimed the row. */
async function sendFreeform(
  db: PrismaClient,
  bird: BirdLike,
  message: { id: string; body: string },
  sub: Pick<NotisSubscription, "id" | "birdConversationId">,
  alert: (message: string) => Promise<void>,
): Promise<void> {
  if (!sub.birdConversationId) {
    await applySendResult(
      db,
      message.id,
      { success: false, retryable: false, error: "no birdConversationId on subscription" },
      alert,
    );
    await alert(`subscription ${sub.id} has no birdConversationId — cannot deliver a reply`);
    return;
  }
  const result = await bird.sendText({
    conversationId: sub.birdConversationId,
    text: message.body,
    idempotencyKey: message.id,
  });
  await applySendResult(db, message.id, result, alert);
}

/** Send `pending` outbound rows into the subscription's conversation. Also
 *  used by the webhook's deterministic ΣΤΟΠ replies. Free-form only —
 *  reactive replies and in-window sends; templates ride
 *  sendProactiveMessages. Each row is claimed before it goes out, so a
 *  reply the sweeper also picked up is never sent twice. Reactive replies
 *  carry no rails by design — a ΣΤΟΠ confirmation must reach the reader. */
export async function sendPendingMessages(
  db: PrismaClient,
  bird: BirdLike,
  messageIds: string[],
  sub: Pick<NotisSubscription, "id" | "birdConversationId">,
  alert: (message: string) => Promise<void>,
): Promise<void> {
  for (const id of messageIds) {
    const message = await db.notisMessage.findUnique({ where: { id } });
    if (!message || message.status !== "pending") continue;
    if (!(await claimForSend(db, id))) continue;
    await sendFreeform(db, bird, message, sub, alert);
  }
}

/**
 * Deliver ONE pending outbound row, honoring its delivery mode. Template
 * sends with no conversation yet bootstrap one (the cold first contact);
 * the returned conversation id is persisted so every later send reuses it.
 *
 * This is the single delivery choke point, so the rails that must hold at
 * the delivery instant live HERE rather than at one call site, and every
 * caller — the send boundary, the sweeper's stale-row retry, the poller's
 * enrollment intro — inherits them. The boundary alone was not enough: a
 * transiently failed row stays pending by design, and the sweeper would
 * re-send it up to an hour later, long after a ΣΤΟΠ or a flipped kill switch.
 *
 * The rails apply to UNPROMPTED sends — a proactive row, or any template
 * send. `proactive` alone was the wrong key: a reply-continuation follow-up
 * is a template send but `proactive: false` (cap-exempt), and it must still
 * respect a ΣΤΟΠ. A free-form row is a reactive reply (decideDelivery
 * guarantees free-form for those), so it bypasses the rails — which is what
 * lets a ΣΤΟΠ confirmation still reach a reader who just unsubscribed.
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

  if (message.proactive || message.deliveryMode === "template") {
    const blocked = await proactiveBlockReason(db, sub.id);
    if (blocked) {
      await suppressMessages(db, [messageId], blocked);
      return;
    }
  }

  if (!(await claimForSend(db, messageId))) return;

  if (message.deliveryMode !== "template") {
    await sendFreeform(db, bird, message, sub, alert);
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
 *  this news is old — so a model-less wake row records what went unexamined. */
async function skipCappedWake(
  db: PrismaClient,
  item: ClaimedItem,
  events: WakeEvent[],
): Promise<void> {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const primary = primaryEvent(ordered);
  const what =
    ordered.length === 1 ? "Μία ενημέρωση δεν εξετάστηκε" : `${ordered.length} ενημερώσεις δεν εξετάστηκαν`;
  const rationale = `(σύστημα) ${what} — ο χρήστης έχει ήδη ${WEEKLY_CAP} αυθόρμητα μηνύματα αυτή την εβδομάδα.`;
  await db.$transaction(async (tx) => {
    const owned = await completeItem(tx, item.id, item.attempts);
    if (!owned) throw new ClaimLostError(item.id);
    // A model-less wake row: the decision log must show what went unexamined,
    // or the next wake re-litigates the same news. model/trace stay null —
    // that is the marker for "no model ran" everywhere (panel, metrics).
    await tx.notisWake.create({
      data: {
        subscriptionId: item.subscriptionId,
        eventType: primary.type,
        eventAt: new Date(ordered[ordered.length - 1].at),
        event: primary as unknown as Prisma.InputJsonValue,
        events:
          ordered.length > 1 ? (ordered as unknown as Prisma.InputJsonValue) : undefined,
        decision: "silence",
        rationale,
        outcome: {
          decision: "silence",
          rationale,
          messages: [],
          scheduledWakes: [],
        } as unknown as Prisma.InputJsonValue,
        costUsd: 0,
        durationMs: 0,
      },
    });
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
      // suppresses, so running it buys a decision entry the rails then have
      // to contradict — and pays for it. Reply-continuations are exempt.
      if (isCapCountable(events) && (await capUsage(db, item.subscriptionId)) >= WEEKLY_CAP) {
        await skipCappedWake(db, item, events);
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
  sub: Pick<NotisSubscription, "id" | "phone">,
  alert: (message: string) => Promise<void>,
): Promise<void> {
  if (!sub.phone) return;
  // The reader may have unsubscribed, or the switch may have flipped, in the
  // hours this SMS sat held between 23:00 and 09:00 — re-check the same rails
  // a WhatsApp send gets at its delivery instant. A held SMS is always a
  // proactive fallback, so it is always subject to them.
  const blocked = await proactiveBlockReason(db, sub.id);
  if (blocked) {
    await suppressMessages(db, [message.id], blocked);
    return;
  }
  const claimed = await db.notisMessage.updateMany({
    where: { id: message.id, status: "pending", failureReason: SMS_HELD_FOR_QUIET_HOURS },
    data: { failureReason: null },
  });
  if (claimed.count !== 1) return;

  const result = await bird.sendSms({ phone: sub.phone, text: message.body });
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

  const now = Date.now();
  const staleClaimBefore = new Date(now - SEND_CLAIM_TTL_MS);
  const stale = await db.notisMessage.findMany({
    where: {
      direction: "outbound",
      status: "pending",
      createdAt: { lt: new Date(now - RESEND_STALE_AFTER_MS) },
      // A row whose send is in flight belongs to whoever claimed it, until
      // that claim goes stale.
      OR: [{ sendingAt: null }, { sendingAt: { lt: staleClaimBefore } }],
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

  const giveUpBefore = now - RESEND_GIVE_UP_MS;
  for (const message of stale) {
    const held =
      message.channel === "sms" && message.failureReason === SMS_HELD_FOR_QUIET_HOURS;
    // A held row is waiting on the clock, not on Bird — the hour it spends
    // between 23:00 and 09:00 must not age it out.
    if (!held && message.createdAt.getTime() < giveUpBefore) {
      // Fenced on `pending`: a send that succeeded between the read above and
      // this update owns the row now, and its `sent` must not be rewritten
      // into a failure.
      const gaveUp = await db.notisMessage.updateMany({
        where: { id: message.id, status: "pending" },
        data: { status: "failed", failureReason: "gave up after 1h of delivery retries" },
      });
      if (gaveUp.count !== 1) continue;
      await alert(`message ${message.id}: undeliverable for over an hour — giving up`);
      continue;
    }
    // SMS rows are never re-sent: the channels API has no idempotency key,
    // and a duplicate SMS is worse than a lost fallback. They age out via
    // the give-up pass above. The one exception is a row that never went
    // out at all because quiet hours held it — this is its 09:00 release.
    if (message.channel === "sms") {
      if (held && !isQuietHour(new Date())) {
        await releaseHeldSms(db, bird, message, message.subscription, alert);
      }
      continue;
    }
    // deliverPendingMessage claims the row (sendingAt) before it sends, so an
    // overlapping sweep or the send boundary loses the race and moves on —
    // Bird never gets two simultaneous requests for one row under its
    // idempotency key. The stale filter above only avoids picking a row whose
    // claim is still fresh; the claim inside is the authoritative fence.
    await deliverPendingMessage(db, bird, message.id, message.subscription, alert);
  }
  return stale.length;
}
