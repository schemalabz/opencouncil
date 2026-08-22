import { z } from "zod";
import { decideDelivery } from "@/agent/delivery";
import { runWake } from "@/agent/runWake";
import { wakeEventSchema } from "@/agent/schemas";
import { CityPreference, Deps, JOURNAL_WINDOW, JournalEntry, WakeEvent } from "@/agent/types";
import type { NotisSubscription, Prisma, PrismaClient } from "../../generated/client";
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
  failItem,
  markFailed,
} from "./queue-core";

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

/** The persist transaction's budget. It holds the subscription's row lock —
 *  the same lock every inbound webhook for that reader waits on — so it needs
 *  room for contention, not just for its own writes. */
const PERSIST_TIMEOUT_MS = 30_000;



// Safety valve for one drain call, not a queue limit — the sweeper runs
// every minute, so leftovers are picked up immediately.
const MAX_ITEMS_PER_DRAIN = 50;

const eventsSchema = z.array(wakeEventSchema).min(1);

function resolveAlert(overrides: DrainDeps) {
  return overrides.alert ?? ((message: string) => sendAlert("queue", message));
}

/**
 * The reader's cities, live from the view. No main database configured is a
 * deliberate dev mode and yields none; a configured database that is
 * unreachable is an outage and throws, failing the item into a retry rather
 * than waking with a reader who appears to follow nothing.
 */
async function assembleCities(sub: NotisSubscription): Promise<CityPreference[]> {
  if (!hasMainDb()) return [];
  return citiesForUser(sub.userId);
}

async function runOneWake(
  db: PrismaClient,
  item: ClaimedItem,
  sub: NotisSubscription,
  event: WakeEvent,
  overrides: DrainDeps,
): Promise<void> {
  const alert = resolveAlert(overrides);
  const deps = overrides.deps ?? buildDeps();
  const bird = overrides.bird ?? realBird;

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

  const { outcome, trace } = await runWake(state, event, deps);

  const delivery =
    outcome.messages.length > 0
      ? decideDelivery(event.type, lastInbound?.createdAt.toISOString(), new Date(event.at))
      : undefined;

  const outboundIds = await db.$transaction(
    async (tx) => {
    // FIRST, before anything reads the journal: this UPDATE takes the
    // subscription's row lock, and every other writer of this reader's
    // journal takes it too (the deterministic ΣΤΟΠ path included, which runs
    // outside the queue's serialization). That lock is what makes the seq
    // allocation below safe — two unlocked MAX(seq)+1 reads collide on
    // NotisJournalEntry_subscriptionId_seq_key, and taking the two tables in
    // opposite orders deadlocks outright (40P01).
    //
    // updatedAt is always touched anyway: it is the conversation list's
    // activity sort key.
    const subData: Prisma.NotisSubscriptionUpdateInput = { updatedAt: new Date() };
    if (outcome.profileRewrite !== undefined) subData.profileText = outcome.profileRewrite;
    // Only the user moves a row into `unsubscribed` — and unsubscribe_user
    // fires only on a user_message wake, so this is the user doing it.
    if (outcome.unsubscribe && sub.status !== "unsubscribed") {
      subData.status = "unsubscribed";
      subData.unsubscribedAt = new Date(event.at);
    }
    await tx.notisSubscription.update({ where: { id: sub.id }, data: subData });

    const { _max } = await tx.notisJournalEntry.aggregate({
      where: { subscriptionId: sub.id },
      _max: { seq: true },
    });

    const wake = await tx.notisWake.create({
      data: {
        subscriptionId: sub.id,
        eventType: event.type,
        eventAt: new Date(event.at),
        event: event as unknown as Prisma.InputJsonValue,
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

    for (const scheduled of outcome.scheduledWakes) {
      // Rows only — nothing fires them until PR 4's poller.
      await tx.notisScheduledWake.create({
        data: { subscriptionId: sub.id, runAfter: new Date(scheduled.at), reason: scheduled.reason },
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
    },
    // Prisma's default is 5s, and this transaction now holds the
    // subscription's row lock while every inbound webhook for the same reader
    // waits on it. Blowing the budget rolls back a run the model was already
    // paid for. Note P2028 does not fire at the deadline: Prisma only notices
    // on the next query, so a long lock wait blocks for its full duration
    // and then dies.
    { timeout: PERSIST_TIMEOUT_MS },
  );

  if (outboundIds.length === 0) return;

  if (delivery?.mode !== "freeform") {
    // Unreachable for user_message wakes; template sends arrive with PR 4.
    await db.notisMessage.updateMany({
      where: { id: { in: outboundIds } },
      data: { status: "failed", failureReason: "template send path not implemented (PR 4)" },
    });
    await alert(
      `wake ${item.id}: ${outboundIds.length} message(s) need a template send path (PR 4) — marked failed`,
    );
    return;
  }

  await sendPendingMessages(db, bird, outboundIds, sub, alert);
}

/** Send `pending` outbound rows into the subscription's conversation. Also
 *  used by the webhook's deterministic ΣΤΟΠ replies. */
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
    // Every branch releases the send claim: the row's outcome is known now,
    // so the next sweep should decide on the outcome rather than wait out the
    // claim's staleness window.
    if (result.success) {
      await db.notisMessage.update({
        where: { id },
        data: {
          status: "sent",
          birdMessageId: result.messageId,
          sendingAt: null,
          // A failureReason from an earlier attempt is history now; leaving it
          // shows a delivered message with an error beside it in the panel.
          failureReason: null,
        },
      });
    } else if (result.retryable) {
      // Transient (network, 5xx, 408, 429): the row STAYS pending so the
      // sweeper retries it under the same idempotency key once Bird recovers.
      // The sweeper gives up — and alerts — after RESEND_GIVE_UP_MS.
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
    // The live lane enqueues exactly one event per row. PR 4's batch-lane
    // coalescing needs per-event progress before a loop here is safe —
    // completeItem is all-or-nothing on the item.
    if (events.length !== 1) {
      await markFailed(db, item.id, item.attempts, `expected 1 event, got ${events.length}`);
      await alert(`queue item ${item.id}: multi-event items are not processable before PR 4`);
      return;
    }
    const sub = await db.notisSubscription.findUnique({ where: { id: item.subscriptionId } });
    if (!sub) {
      await markFailed(db, item.id, item.attempts, "subscription no longer exists");
      return;
    }
    await runOneWake(db, item, sub, events[0], overrides);
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
      select: { status: true },
    });
    if (after?.status === "done") processed++;
    else failed++;
  }
  return { processed, failed };
}

/** A pending message older than this is not worth delivering any more —
 *  mark it failed and alert instead of retrying forever. */
export const RESEND_GIVE_UP_MS = 60 * 60_000;

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
  const staleClaimBefore = new Date(now - SEND_TIMEOUT_MS);
  const stale = await db.notisMessage.findMany({
    where: {
      direction: "outbound",
      status: "pending",
      deliveryMode: "freeform",
      createdAt: { lt: new Date(now - RESEND_STALE_AFTER_MS) },
      // Rows whose send is in flight belong to whoever claimed them, until
      // that claim goes stale.
      OR: [{ sendingAt: null }, { sendingAt: { lt: staleClaimBefore } }],
    },
    select: {
      id: true,
      createdAt: true,
      sendingAt: true,
      subscription: { select: { id: true, birdConversationId: true } },
    },
    take: 50,
  });

  const giveUpBefore = now - RESEND_GIVE_UP_MS;
  let handled = 0;
  for (const message of stale) {
    if (message.createdAt.getTime() < giveUpBefore) {
      // Fenced on `pending`: a send that succeeded between the read above and
      // this update owns the row now, and its `sent` must not be rewritten
      // into a failure.
      const gaveUp = await db.notisMessage.updateMany({
        where: { id: message.id, status: "pending" },
        data: { status: "failed", failureReason: "gave up after 1h of delivery retries" },
      });
      if (gaveUp.count === 1) {
        await alert(`message ${message.id}: undeliverable for over an hour — giving up`);
        handled++;
      }
      continue;
    }

    // Claim before sending. `count === 1` means this run owns the send; a
    // concurrent sweep loses the race and moves on, so Bird never receives
    // two simultaneous requests for one row.
    const claimed = await db.notisMessage.updateMany({
      where: {
        id: message.id,
        status: "pending",
        OR: [{ sendingAt: null }, { sendingAt: { lt: staleClaimBefore } }],
      },
      data: { sendingAt: new Date() },
    });
    if (claimed.count !== 1) continue;

    handled++;
    await sendPendingMessages(db, bird, [message.id], message.subscription, alert);
  }
  return handled;
}
