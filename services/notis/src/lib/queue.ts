import { z } from "zod";
import { decideDelivery } from "@/agent/delivery";
import { runWake } from "@/agent/runWake";
import { primaryEvent, wakeEventSchema, wakeEventsSchema } from "@/agent/schemas";
import {
  TEMPLATES,
  linkPathForEvent,
  linkPathFromText,
  renderTemplate,
  type TemplateName,
} from "@/agent/templates";
import {
  CityPreference,
  CONVERSATION_WINDOW,
  Deps,
  DECISION_WINDOW,
  DecisionEntry,
  WakeEvent,
} from "@/agent/types";
import type { NotisMessage, NotisSubscription, Prisma, PrismaClient } from "../../generated/client";
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
  consumePendingLiveEvents,
  deferItem,
  enqueueLiveWake,
  failItem,
  markFailed,
  touchClaim,
} from "./queue-core";
import { maybeCompact } from "./compaction";
import {
  CONVERSATION_ROW_SELECT,
  PROACTIVE_LIMIT_REASON,
  conversationMessageFilter,
  toConversationMessage,
} from "./conversation";
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

/**
 * Gap between consecutive sends of one batch. Bird accepts same-second
 * messages in order but WhatsApp shows no sub-minute ordering, and
 * same-second deliveries have been observed inverted on the handset — the
 * gap keeps each message's timestamp (and delivery) behind the previous
 * one's. Applied between sends, never before the first.
 */
export const SEND_SPACING_MS = 1_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Keyed send pacing: one implementation for every send path. `pace(key)`
 * waits out the remainder of SEND_SPACING_MS since the key's previous send
 * — the first send per key never waits, and different keys (readers) never
 * delay each other, which is what the sweeper needs.
 */
export function makeSendPacer(gapMs: number = SEND_SPACING_MS) {
  const lastByKey = new Map<string, number>();
  return async (key: string): Promise<void> => {
    const last = lastByKey.get(key);
    if (last !== undefined) {
      const wait = gapMs - (Date.now() - last);
      if (wait > 0) await sleep(wait);
    }
    lastByKey.set(key, Date.now());
  };
}

/** The persist transaction's budget. It holds the subscription's row lock —
 *  the same lock every inbound webhook for that reader waits on — so it needs
 *  room for contention, not just for its own writes. */
const PERSIST_TIMEOUT_MS = 30_000;

// Safety valve for one drain call, not a queue limit — the sweeper runs
// every minute, so leftovers are picked up immediately.
const MAX_ITEMS_PER_DRAIN = 50;

const eventsSchema = wakeEventsSchema.min(1);

/** How long a paused item sleeps before the claim looks at it again. */
export const PAUSE_DEFER_MS = 15 * 60_000;
/** Claim-time margin: a wake this close to quiet hours defers instead of
 *  racing the boundary with a 30-60s model run. */
const QUIET_MARGIN_MS = 10 * 60_000;
/** How many promises the agent may carry for one reader. The block has to stay
 *  readable, and a reader with twenty open promises effectively has none. */
export const MAX_OPEN_COMMITMENTS = 5;
/**
 * The hard rail: at most this many UNREPLIED template sends per rolling week.
 *
 * A template send is a cold push. It reaches a reader whose 24h WhatsApp
 * window is shut, so nothing they did invited it. Once this many have gone
 * unanswered the reader is not reading, and the next one does not go out.
 *
 * The unit is the WAKE, not the message row: one wake is one occasion the
 * handset buzzed, however many bubbles the agent wrote for it. Counting rows
 * let a three-bubble wake spend a whole week, and let the boundary deliver
 * half a wake once the budget ran out mid-batch.
 *
 * Freeform sends are never capped. They happen only inside the 24h window,
 * which only the reader can open, so a freeform send answers someone who is
 * already in the conversation.
 */
export const WEEKLY_TEMPLATE_CAP = 5;
const WEEK_MS = 7 * 24 * 60 * 60_000;
/** How long a template send has to draw an answer before it counts against
 *  the cap for good. A send inside this window with no answer yet already
 *  counts — the rail has to stop a burst on the day it happens — and stops
 *  counting if the reader answers in time. Answer later and the send stays
 *  counted: the window is the reader's chance to show that push landed, and
 *  it does not reopen. */
const REPLY_WINDOW_MS = 24 * 60 * 60_000;
/** Delivery states that mean the row reached the reader, or still will.
 *  `failed` and `suppressed` never arrived, so they never count. */
const REACHED_STATUSES = ["pending", "sent", "delivered", "read"];

/** Reactive = the reader spoke; bypasses every rail. */
export function isReactiveWake(events: WakeEvent[]): boolean {
  return events.some((e) => e.type === "user_message");
}

/** Unprompted: not reactive, and not purely a promised follow-up to a reader
 *  question. A mixed coalesced wake counts, conservatively. Stamped on the
 *  message row as `proactive`, which the panel reads.
 *
 *  It does NOT decide the template cap. That rail counts cold pushes, and a
 *  promised follow-up that lands outside the 24h window is as cold as any
 *  other — the reader asked days ago and has heard nothing since. */
export function isUnprompted(events: WakeEvent[]): boolean {
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
  const unprompted = isUnprompted(ordered);

  // The decision log comes from the wake records themselves — one row per
  // wake, including the shell's own model-less decisions (a ΣΤΟΠ pre-step, a
  // cap skip). eventAt orders on the world's timeline; id breaks same-instant
  // ties in insertion order.
  // Everything at or before the watermark is already folded into `memory`;
  // reading those rows again would say the same thing twice.
  const past = sub.memoryThrough ? { gt: sub.memoryThrough } : undefined;
  const wakeRows = await db.notisWake.findMany({
    where: { subscriptionId: sub.id, ...(past ? { eventAt: past } : {}) },
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

  const windowOpenedAt = await lastWhatsAppInboundAt(db, sub.id);

  // The conversation the agent sees is the real message record: inbound
  // messages, and outbound messages that actually reached the reader. A
  // failed send is excluded, so the agent never treats a stopped message as
  // delivered — the delivery status is the source of truth, not a claim
  // written before the send.
  //
  // The one exception is a send the proactive limit held back. That text was
  // written FOR this reader and never left, so it is shown with notSent set:
  // hiding it would have the next wake write the same news again, believing
  // it was never said.
  const messageRows = await db.notisMessage.findMany({
    where: {
      subscriptionId: sub.id,
      ...(past ? { createdAt: past } : {}),
      ...conversationMessageFilter(),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CONVERSATION_WINDOW,
    select: CONVERSATION_ROW_SELECT,
  });
  const conversation = messageRows.reverse().map(toConversationMessage);

  const cities = await assembleCities(sub);
  // Open promises never age out: unlike the two windows above, a commitment
  // leaves only when the agent resolves it.
  const openCommitments = await db.notisCommitment.findMany({
    where: { subscriptionId: sub.id, resolvedAt: null },
    orderBy: { createdAt: "asc" },
    select: { slug: true, what: true, createdAt: true },
  });
  const state = {
    user: { name: sub.userName ?? "", cities },
    profile: sub.profileText,
    conversation,
    decisions,
    commitments: openCommitments.map((c) => ({
      slug: c.slug,
      what: c.what,
      since: c.createdAt.toISOString().slice(0, 10),
    })),
    ...(sub.memory ? { memory: sub.memory } : {}),
  };

  // Incremental delivery, reactive wakes only: someone is waiting and no
  // rail applies to a reply, so each send goes out the moment the model
  // writes it. The row is created wakeId-less here and adopted by the wake
  // row at persistence; a row the send left pending is the sweeper's to
  // finish. The batch lane (and every deliver-less caller: playground,
  // dry-run, fixtures) keeps batch delivery at the boundary.
  const incrementalIds: string[] = [];
  const pace = makeSendPacer();
  // Everything absorb has consumed so far: if the wake later fails BEFORE
  // any delivery (the retry path), these must be re-enqueued or the
  // messages die with rows nobody will ever run.
  const consumedAbsorbed: WakeEvent[] = [];
  // The heartbeat keeps a long wake's claim fresh so the stale reclaim only
  // fires for actually-dead workers — wired for BOTH lanes.
  const heartbeat = () => touchClaim(db, item.id, item.attempts);
  const wakeDeps: Deps = reactive
    ? {
        ...deps,
        heartbeat,
        // Mid-run absorption: messages that arrive while this wake runs are
        // consumed (their queued wakes closed) and handed to the model, so
        // the reader's correction supersedes the request it corrected.
        absorb: async () => {
          const raw = await consumePendingLiveEvents(db, sub.id);
          if (raw.length === 0) return [];
          // Per element, not wholesale: one malformed row must not discard
          // its well-formed siblings after they were already consumed.
          const events: WakeEvent[] = [];
          for (const candidate of raw) {
            const parsed = wakeEventSchema.safeParse(candidate);
            if (parsed.success) events.push(parsed.data);
            else await alert(`absorb dropped an unparseable event for ${sub.id}`);
          }
          consumedAbsorbed.push(...events);
          return events;
        },
        deliver: async (text: string) => {
          // The consent boundary, re-read at the send instant: a ΣΤΟΠ that
          // arrived after this wake started must stop its sends too — it is
          // never enqueued, so absorb cannot surface it.
          const freshSub = await db.notisSubscription.findUnique({
            where: { id: sub.id },
            select: { status: true },
          });
          if (freshSub?.status === "unsubscribed") {
            return {
              ok: false,
              detail:
                "the reader unsubscribed — send nothing further and finish the wake silently",
            };
          }
          const message = await db.notisMessage.create({
            data: {
              subscriptionId: sub.id,
              direction: "outbound",
              body: text,
              channel: "whatsapp",
              proactive: unprompted,
              // Reactive by construction: the closure exists only on
              // reactive wakes, and a reply is never railed.
              railed: false,
              deliveryMode: "freeform",
              status: "pending",
            },
            select: { id: true },
          });
          incrementalIds.push(message.id);
          // Same-turn tool calls arrive back-to-back; without a gap Bird
          // accepts them in the same second and the handset may show them
          // inverted. Cross-turn gaps already exceed the spacing.
          await pace(sub.id);
          let outcome: SendOutcome | undefined;
          try {
            outcome = await deliverPendingMessage(db, bird, message.id, sub, alert);
          } catch (error) {
            return {
              ok: false,
              detail: error instanceof Error ? error.message : String(error),
            };
          }
          if (outcome?.status === "sent") return { ok: true };
          if (outcome?.status === "failed" && outcome.smsFallback === "sent") {
            // The conversation continued on its second leg — tell the model
            // which channel carried it.
            return { ok: true, detail: "delivered over SMS (WhatsApp failed)" };
          }
          if (outcome?.status === "suppressed") {
            return {
              ok: false,
              detail:
                "suppressed: the reader unsubscribed — send nothing further and " +
                "finish the wake silently",
            };
          }
          if (outcome?.status === "pending") {
            return {
              ok: false,
              detail: "transient delivery failure — the sweeper retries it shortly",
            };
          }
          return {
            ok: false,
            detail: outcome?.failureReason ?? `status: ${outcome?.status ?? "unknown"}`,
          };
        },
      }
    : { ...deps, heartbeat };

  // The wall clock, not the events' timestamps: this wake may have waited
  // out quiet hours or a pause since they were recorded.
  let runResult: Awaited<ReturnType<typeof runWake>>;
  try {
    runResult = await runWake(state, ordered, wakeDeps, { now: new Date() });
  } catch (error) {
    // A pre-delivery failure retries the item — but absorb has already
    // consumed the newer messages' own rows. Re-enqueue them (the CAS
    // append merges into any newer pending row) so nothing the reader sent
    // dies with a retryable error.
    for (const event of consumedAbsorbed) {
      await enqueueLiveWake(db, { subscriptionId: sub.id, event });
    }
    throw error;
  }
  const { outcome, trace, absorbed } = runResult;

  // Absorbed reader messages belong to THIS wake now — their queue rows are
  // consumed, so this record is the only place they can appear.
  const finalEvents =
    absorbed.length > 0
      ? [...ordered, ...absorbed].sort((a, b) => a.at.localeCompare(b.at))
      : ordered;
  const finalPrimary = absorbed.length > 0 ? primaryEvent(finalEvents) : primary;
  const finalLastAt = finalEvents[finalEvents.length - 1].at;

  // The primary event picks the shell; the 24h window is judged at the SEND
  // moment, which is now — never at the event's timestamp. A meeting event
  // carries its completedAt, and the quiet-hours clamp or a pause deferral
  // can put hours or days between the two: judging at the event time picks
  // freeform for a window that closed in between, and a rejected freeform
  // send has no SMS fallback (that covers template rows only).
  const delivery =
    outcome.messages.length > 0
      ? decideDelivery(primary, windowOpenedAt, new Date())
      : undefined;

  const unparseableSchedules: string[] = [];
  const persistOnce = () => db.$transaction(
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
      // finalLastAt, not lastAt: an unsubscribe honored from an ABSORBED
      // message must not be dated before the request itself.
      subData.unsubscribedAt = new Date(finalLastAt);
    }
    await tx.notisSubscription.update({ where: { id: sub.id }, data: subData });

    // Nothing queued may outlive an unsubscribe. This wake's OWN rows are
    // exempt: the goodbye the agent sends alongside unsubscribe_user must
    // still go out (incremental rows already exist, so they are excluded by
    // id; batch rows are created after this statement).
    if (outcome.unsubscribe) {
      await suppressPendingOutbound(tx, sub.id, incrementalIds);
      // A promise cannot outlive the reader's departure any more than a queued
      // message can — the same rule, applied to the other durable store.
      await tx.notisCommitment.updateMany({
        where: { subscriptionId: sub.id, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
    }

    // Commitments ride the wake's transaction: atomic with the record that
    // explains them. A wake whose persist fails twice loses both, which is the
    // accepted trade — a promise attached to a wake that never landed is not
    // worth a second write path.
    for (const slug of outcome.commitments?.resolve ?? []) {
      await tx.notisCommitment.updateMany({
        where: { subscriptionId: sub.id, slug, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
    }
    for (const c of outcome.commitments?.record ?? []) {
      // Re-recording a slug replaces what it says and reopens it if it had
      // been closed: the reader raised it again.
      await tx.notisCommitment.upsert({
        where: { subscriptionId_slug: { subscriptionId: sub.id, slug: c.slug } },
        create: { subscriptionId: sub.id, slug: c.slug, what: c.what },
        update: { what: c.what, resolvedAt: null },
      });
    }
    const recordedSlugs = (outcome.commitments?.record ?? []).map((c) => c.slug);
    if (recordedSlugs.length > 0) {
      // Cap the open list: the prompt block has to stay readable, and a reader
      // with twenty open promises has none. Oldest wins the eviction — but the
      // slugs recorded THIS wake are exempt, because re-recording a resolved
      // slug reopens it and keeps its original createdAt. Without the
      // exemption a promise the agent just made, on a handle it first used
      // months ago, would be the oldest open row and get evicted by the very
      // statement meant to make room for it.
      const open = await tx.notisCommitment.findMany({
        where: { subscriptionId: sub.id, resolvedAt: null, slug: { notIn: recordedSlugs } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const room = Math.max(0, MAX_OPEN_COMMITMENTS - recordedSlugs.length);
      if (open.length > room) {
        await tx.notisCommitment.updateMany({
          where: { id: { in: open.slice(0, open.length - room).map((c) => c.id) } },
          data: { resolvedAt: new Date() },
        });
      }
    }

    const wake = await tx.notisWake.create({
      data: {
        subscriptionId: sub.id,
        eventType: finalPrimary.type,
        eventAt: new Date(finalLastAt),
        event: finalPrimary as unknown as Prisma.InputJsonValue,
        // The full array only when the wake coalesced several events.
        events:
          finalEvents.length > 1 ? (finalEvents as unknown as Prisma.InputJsonValue) : undefined,
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
      // The poller fires these. Origin decides the eventual template shell:
      // a schedule made while answering the reader is a promised reply; one
      // made after proactive news is not. It no longer decides anything about
      // the cap — outside the 24h window both are cold pushes.
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
            proactive: unprompted,
            railed: !reactive,
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
  );

  // The record can roll back; incremental sends cannot. After real
  // deliveries a plain rethrow would retry the ITEM — re-running the model
  // and re-delivering with fresh idempotency keys — so the persist step
  // fails FORWARD like the loop does: one retry, then close the item with
  // the loudest alert we have. Losing the record is bad; answering twice
  // is worse.
  let outboundIds: string[];
  try {
    outboundIds = await persistOnce();
  } catch (error) {
    if (error instanceof ClaimLostError) {
      if (incrementalIds.length > 0) {
        await alert(
          `wake for ${sub.id} lost its claim after ${incrementalIds.length} incremental ` +
            "deliveries — the reclaimer may answer again",
        );
      }
      throw error;
    }
    if (incrementalIds.length === 0) throw error;
    try {
      outboundIds = await persistOnce();
    } catch (secondError) {
      if (secondError instanceof ClaimLostError) throw secondError;
      const detail = secondError instanceof Error ? secondError.message : String(secondError);
      await alert(
        `wake for ${sub.id} DELIVERED ${incrementalIds.length} message(s) but its record ` +
          `failed to persist twice (${detail}) — closing the item so the model does not ` +
          "re-run; this wake has no record",
      );
      await markFailed(
        db,
        item.id,
        item.attempts,
        `delivered but persist failed: ${detail}`.slice(0, 300),
      );
      return;
    }
  }

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

/** The outcome a send path reports upward — what the row now says, plus
 *  what the SMS fallback did when WhatsApp failed terminally. */
export interface SendOutcome {
  status: "sent" | "pending" | "failed" | "suppressed";
  failureReason?: string | null;
  smsFallback?: "sent" | "held" | "failed" | "skipped";
}

/** Record a Bird send result on the message row: sent, stay-pending
 *  (transient — the sweeper retries under the same idempotency key), or
 *  terminal failed with an alert. Returns what it wrote. */
async function applySendResult(
  db: PrismaClient,
  id: string,
  result: { success: boolean; messageId?: string; retryable?: boolean; error?: string },
  alert: (message: string) => Promise<void>,
): Promise<SendOutcome> {
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
    return { status: "sent" };
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
    return { status: "pending", failureReason: result.error ?? "unknown error" };
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
    return { status: "failed", failureReason: result.error ?? "unknown error" };
  }
}

/**
 * One-shot SMS with the outcome recorded on the row. No idempotency key —
 * the channels API has none — so every caller must guarantee single-fire
 * (the fallback's unique fallbackForId, the held release's claim fence).
 */
export async function sendSmsAndRecord(
  db: PrismaClient,
  bird: BirdLike,
  messageId: string,
  phone: string,
  text: string,
  alert: (message: string) => Promise<void>,
  context: string,
): Promise<boolean> {
  const result = await bird.sendSms({ phone, text });
  if (result.success) {
    await db.notisMessage.update({
      where: { id: messageId },
      data: { status: "sent", birdMessageId: result.messageId },
    });
    return true;
  }
  await db.notisMessage.update({
    where: { id: messageId },
    data: { status: "failed", failureReason: (result.error ?? "unknown error").slice(0, 300) },
  });
  await alert(`${context}: ${result.error ?? "unknown error"}`);
  return false;
}

/**
 * SMS as the conversation's second leg (PRD update): when a WhatsApp send
 * fails TERMINALLY, the same content goes out once as an SMS — templates in
 * their rendered shell with the footer, replies as the raw body (SMS has no
 * formatting, links work as text). The sms row's unique fallbackForId makes
 * every trigger path replay-proof.
 *
 * The rails follow the ROW's class: a railed row's fallback obeys pause and
 * quiet hours (held to the 09:00 release) and never goes to an unsubscribed
 * reader; a reply's fallback bypasses pause and quiet like the reply itself
 * would, and only the unsubscribed check stands — consent outranks
 * deliverability.
 */
export async function maybeSendSmsFallback(
  db: PrismaClient,
  bird: BirdLike,
  failed: Pick<
    NotisMessage,
    | "id"
    | "subscriptionId"
    | "wakeId"
    | "channel"
    | "deliveryMode"
    | "template"
    | "proactive"
    | "railed"
    | "body"
  >,
  alert: (message: string) => Promise<void>,
): Promise<"sent" | "held" | "failed" | "skipped"> {
  if (failed.channel !== "whatsapp") return "skipped";

  const sub = await db.notisSubscription.findUnique({ where: { id: failed.subscriptionId } });
  if (!sub?.phone || sub.status === "unsubscribed") return "skipped";

  if (failed.railed) {
    const settings = await getProactiveSettings(db);
    if (settings.paused) return "skipped";
  }

  const text =
    failed.deliveryMode === "template" && failed.template
      ? (() => {
          const rendered = renderTemplate(failed.template as TemplateName, failed.body);
          return `${rendered.body}\n\n${rendered.footer}`;
        })()
      : failed.body;
  const held = failed.railed && isQuietHour(new Date());

  let smsId: string;
  try {
    const sms = await db.notisMessage.create({
      data: {
        subscriptionId: failed.subscriptionId,
        wakeId: failed.wakeId,
        direction: "outbound",
        body: text,
        channel: "sms",
        proactive: failed.proactive,
        railed: failed.railed,
        fallbackForId: failed.id,
        status: "pending",
        ...(held ? { failureReason: SMS_HELD_FOR_QUIET_HOURS } : {}),
      },
      select: { id: true },
    });
    smsId = sms.id;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return "skipped"; // replayed trigger
    throw error;
  }

  // Held rows leave here pending; the sweeper sends them at the release.
  if (held) return "held";

  const ok = await sendSmsAndRecord(
    db,
    bird,
    smsId,
    sub.phone,
    text,
    alert,
    `SMS fallback failed for message ${failed.id}`,
  );
  return ok ? "sent" : "failed";
}

/** The rails' own vocabulary, Greek names included — one closed set shared
 *  by the writer and the panel. */
export const SUPPRESSION_REASONS = {
  unsubscribed: "απεγγραφή",
  paused: "παύση",
  [PROACTIVE_LIMIT_REASON]: "όριο μηνυμάτων",
  // Written by the per-message weekly cap the template cap replaced. Nothing
  // writes it any more; the entry stays so the panel still labels old rows.
  "weekly cap": "όριο εβδομάδας",
} as const;

export type SuppressionReason = keyof typeof SUPPRESSION_REASONS;

/** The Greek name for a reason read off a message row. A reason the set does
 *  not name — a Bird error string, a rail added without a label — reads
 *  through as itself rather than disappearing from the panel. */
export function suppressionLabel(reason: string): string {
  return (SUPPRESSION_REASONS as Record<string, string>)[reason] ?? reason;
}

/**
 * Kill every pending outbound row of a subscription — the unsubscribe
 * cleanup, shared by ALL status→unsubscribed sites (bare ΣΤΟΠ, the agent's
 * unsubscribe_user, the poller's phone-gone). exceptIds spares the goodbye
 * the unsubscribing wake itself sends.
 */
export async function suppressPendingOutbound(
  db: PrismaClient | Prisma.TransactionClient,
  subscriptionId: string,
  exceptIds: string[] = [],
): Promise<void> {
  await db.notisMessage.updateMany({
    where: {
      subscriptionId,
      direction: "outbound",
      status: "pending",
      ...(exceptIds.length > 0 ? { id: { notIn: exceptIds } } : {}),
    },
    data: { status: "suppressed", failureReason: "unsubscribed" satisfies SuppressionReason },
  });
}

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

/** One outbound row, as the cap rule reads it. */
interface CapRow {
  id: string;
  wakeId: string | null;
  fallbackForId: string | null;
  deliveryMode: string | null;
  status: string | null;
  createdAt: Date;
}

const CAP_ROW_SELECT = {
  id: true,
  wakeId: true,
  fallbackForId: true,
  deliveryMode: true,
  status: true,
  createdAt: true,
} as const;

/**
 * The only outbound rows an occasion can be built from: the template send
 * itself, and the SMS fallback that carries it when WhatsApp fails. A
 * freeform row can never make an occasion countable — decideDelivery gives
 * every row of a wake the same mode — so leaving it in the database keeps
 * both reads proportional to the pushes made, not to how much anyone talks.
 */
function countableOutboundFilter(): Prisma.NotisMessageWhereInput {
  return {
    direction: "outbound",
    OR: [{ deliveryMode: "template" }, { fallbackForId: { not: null } }],
  };
}

/**
 * The occasion a row belongs to. `wakeId` is the real answer; two rows have
 * none and fall back:
 * - the enrollment intro is written by the poller with no wake at all, so it
 *   is its own occasion;
 * - an SMS fallback of a wake-less row points at the row it replaces, which
 *   keeps the two legs of one push on a single key.
 * A fallback of a row that HAS a wake already carries that same wakeId, so
 * it groups correctly without the second clause.
 */
function capGroupKey(row: CapRow): string {
  return row.wakeId ?? row.fallbackForId ?? row.id;
}

/**
 * The rule itself, over one reader's rows: how many of the rolling week's
 * template sends drew no answer.
 *
 * An occasion counts when it pushed a template AND something in it reached
 * the reader. The WhatsApp row and its SMS fallback share an occasion, so a
 * template that failed on WhatsApp and arrived as an SMS counts once — the
 * handset still buzzed with it, and the reader still owes no answer twice.
 *
 * Replied means any inbound message, on either channel, inside
 * REPLY_WINDOW_MS of the moment the push reached them. An SMS reply is an
 * answer like any other here; only decideDelivery cares which channel opened
 * Meta's 24h window.
 */
function countUnrepliedTemplateSends(outbound: CapRow[], inboundAt: Date[]): number {
  const occasions = new Map<string, { template: boolean; reachedAt: Date | null }>();
  for (const row of outbound) {
    const key = capGroupKey(row);
    const occasion = occasions.get(key) ?? { template: false, reachedAt: null };
    if (row.deliveryMode === "template") occasion.template = true;
    if (row.status !== null && REACHED_STATUSES.includes(row.status)) {
      if (occasion.reachedAt === null || row.createdAt < occasion.reachedAt) {
        occasion.reachedAt = row.createdAt;
      }
    }
    occasions.set(key, occasion);
  }

  let unreplied = 0;
  for (const { template, reachedAt } of occasions.values()) {
    if (!template || reachedAt === null) continue;
    const deadline = reachedAt.getTime() + REPLY_WINDOW_MS;
    const replied = inboundAt.some((at) => at > reachedAt && at.getTime() <= deadline);
    if (!replied) unreplied++;
  }
  return unreplied;
}

/**
 * The reader's spent budget: unreplied template sends in the rolling week.
 * Exported so the pre-model check, the send boundary and the panel all
 * measure exactly the same thing.
 *
 * `excludeIds` drops the rows of the wake being decided right now. They are
 * already written and pending by the time the boundary asks, and a wake must
 * not count against itself.
 */
export async function unrepliedTemplateSends(
  db: PrismaClient,
  subscriptionId: string,
  excludeIds: string[] = [],
): Promise<number> {
  const since = new Date(Date.now() - WEEK_MS);
  const [outbound, inbound] = await Promise.all([
    db.notisMessage.findMany({
      where: {
        subscriptionId,
        createdAt: { gte: since },
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
        ...countableOutboundFilter(),
      },
      select: CAP_ROW_SELECT,
    }),
    db.notisMessage.findMany({
      where: { subscriptionId, direction: "inbound", createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);
  return countUnrepliedTemplateSends(
    outbound,
    inbound.map((m) => m.createdAt),
  );
}

/**
 * Every reader whose budget is spent. The panel needs this for its at-cap
 * warning; a second implementation there would drift from the one the
 * boundary enforces, so it calls here instead.
 *
 * Two narrow reads rather than one wide one: the first is bounded by the
 * pushes actually made this week, and the second only asks about the readers
 * that first one found. Everything else — a chatty reader's replies, every
 * freeform send — never reaches Node.
 */
export async function subscriptionsAtTemplateCap(
  db: PrismaClient,
): Promise<Array<{ subscriptionId: string; count: number }>> {
  const since = new Date(Date.now() - WEEK_MS);
  const pushes = await db.notisMessage.findMany({
    where: { createdAt: { gte: since }, ...countableOutboundFilter() },
    select: { ...CAP_ROW_SELECT, subscriptionId: true },
  });
  if (pushes.length === 0) return [];

  const outbound = new Map<string, CapRow[]>();
  for (const row of pushes) {
    const rows = outbound.get(row.subscriptionId) ?? [];
    rows.push(row);
    outbound.set(row.subscriptionId, rows);
  }

  const replies = await db.notisMessage.findMany({
    where: {
      subscriptionId: { in: [...outbound.keys()] },
      direction: "inbound",
      createdAt: { gte: since },
    },
    select: { subscriptionId: true, createdAt: true },
  });
  const inbound = new Map<string, Date[]>();
  for (const row of replies) {
    const times = inbound.get(row.subscriptionId) ?? [];
    times.push(row.createdAt);
    inbound.set(row.subscriptionId, times);
  }

  const spent: Array<{ subscriptionId: string; count: number }> = [];
  for (const [subscriptionId, rows] of outbound) {
    const count = countUnrepliedTemplateSends(rows, inbound.get(subscriptionId) ?? []);
    if (count >= WEEKLY_TEMPLATE_CAP) spent.push({ subscriptionId, count });
  }
  return spent.sort((a, b) => b.count - a.count);
}

/**
 * The instant Meta's 24h customer-service window last opened: the reader's
 * last WhatsApp inbound. WhatsApp only — an SMS reply does not open the
 * window, so it must not steer decideDelivery into a freeform send the
 * platform rejects.
 */
async function lastWhatsAppInboundAt(
  db: PrismaClient,
  subscriptionId: string,
): Promise<string | undefined> {
  const row = await db.notisMessage.findFirst({
    where: { subscriptionId, direction: "inbound", channel: "whatsapp" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt.toISOString();
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
): Promise<SendOutcome> {
  if (!sub.birdConversationId) {
    const outcome = await applySendResult(
      db,
      message.id,
      { success: false, retryable: false, error: "no birdConversationId on subscription" },
      alert,
    );
    return outcome;
  }
  const result = await bird.sendText({
    conversationId: sub.birdConversationId,
    text: message.body,
    idempotencyKey: message.id,
  });
  return applySendResult(db, message.id, result, alert);
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
  const pace = makeSendPacer();
  for (const id of messageIds) {
    const message = await db.notisMessage.findUnique({ where: { id } });
    if (!message || message.status !== "pending") continue;
    await pace(sub.id);
    if (!(await claimForSend(db, id))) continue;
    const outcome = await sendFreeform(db, bird, message, sub, alert);
    // The conversation's second leg applies to the deterministic replies
    // too (the ΣΤΟΠ confirmation rides this path).
    if (outcome.status === "failed" && message.channel === "whatsapp") {
      await maybeSendSmsFallback(db, bird, message, alert);
    }
  }
}

/**
 * The meeting path for a message's wake, when its event names one. Costs one
 * indexed read, and only on the template path — a freeform reply never asks.
 * Any failure to resolve is a silent undefined: the caller falls back to the
 * body link, and neither source is worth failing a send over.
 */
async function linkPathForMessage(
  db: PrismaClient,
  message: Pick<NotisMessage, "wakeId" | "deliveryMode">,
): Promise<string | undefined> {
  if (message.deliveryMode !== "template" || !message.wakeId) return undefined;
  try {
    const wake = await db.notisWake.findUnique({
      where: { id: message.wakeId },
      select: { event: true },
    });
    if (!wake?.event) return undefined;
    const parsed = wakeEventSchema.safeParse(wake.event);
    return parsed.success ? linkPathForEvent(parsed.data) : undefined;
  } catch (error) {
    // Deliberately swallowed. This lookup only chooses between two link
    // paths; the caller has a fallback for both. Letting it throw would fail
    // a message that is otherwise ready to send, which is the outcome this
    // whole change exists to prevent. Logged rather than silent, so a lookup
    // that is broken for everyone is visible instead of merely degraded.
    console.warn(
      `[notis:queue] link path lookup failed for message ${message.wakeId}:`,
      error instanceof Error ? error.message : error,
    );
    return undefined;
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
 * is a template send but `proactive: false`, and it must still respect a
 * ΣΤΟΠ. A free-form row is a reactive reply (decideDelivery
 * guarantees free-form for those), so it bypasses the rails — which is what
 * lets a ΣΤΟΠ confirmation still reach a reader who just unsubscribed.
 */
export async function deliverPendingMessage(
  db: PrismaClient,
  bird: BirdLike,
  messageId: string,
  sub: Pick<NotisSubscription, "id" | "phone" | "userName" | "birdConversationId">,
  alert: (message: string) => Promise<void>,
): Promise<SendOutcome | undefined> {
  const message = await db.notisMessage.findUnique({ where: { id: messageId } });
  if (!message || message.status !== "pending") return undefined;

  // Terminal WhatsApp failures fall through to SMS here, in ONE place, so
  // every trigger path (boundary, sweeper, incremental closure) gets the
  // conversation's second leg for free.
  const finish = async (outcome: SendOutcome): Promise<SendOutcome> => {
    if (outcome.status !== "failed" || message.channel !== "whatsapp") return outcome;
    const smsFallback = await maybeSendSmsFallback(db, bird, message, alert);
    return { ...outcome, smsFallback };
  };

  // The union keeps the deploy window safe: rows written by OLD code after
  // the backfill carry railed=false but still say proactive/template.
  if (message.railed || message.proactive || message.deliveryMode === "template") {
    const blocked = await proactiveBlockReason(db, sub.id);
    if (blocked) {
      await suppressMessages(db, [messageId], blocked);
      return { status: "suppressed", failureReason: blocked };
    }
  }

  if (!(await claimForSend(db, messageId))) return undefined;

  if (message.deliveryMode !== "template") {
    return finish(await sendFreeform(db, bird, message, sub, alert));
  }

  const template = message.template as TemplateName;
  // Every template send names its recipient, so a row without a phone is a
  // failure on both paths, not just the cold one.
  if (!sub.phone) {
    return finish(
      await applySendResult(
        db,
        messageId,
        { success: false, retryable: false, error: "no phone on subscription for a template send" },
        alert,
      ),
    );
  }

  // The dynamic URL button. The wake's own event is the first source — it
  // names the meeting deterministically, which is what these shells were
  // built around. A scheduled follow-up names no meeting, so there the link
  // the agent wrote into the body is all there is. bird.ts substitutes a real
  // page if both come back empty: a shell that declares {{link_path}} and
  // does not receive it is a terminal 422, not a retry.
  const linkPath = (await linkPathForMessage(db, message)) ?? linkPathFromText(message.body);
  if (!linkPath && TEMPLATES[template].hasLinkPath) {
    // The shell will get FALLBACK_LINK_PATH. Countable rather than silent:
    // "how often is the button generic?" is the question that tells you
    // whether the fallback is a safety net or the normal outcome.
    console.warn(
      `[notis:queue] no link path for ${template} message ${message.id} — button falls back to the explainer`,
    );
  }

  if (sub.birdConversationId) {
    const result = await bird.sendTemplate({
      conversationId: sub.birdConversationId,
      phone: sub.phone,
      template,
      text: message.body,
      linkPath,
      idempotencyKey: message.id,
    });
    return finish(await applySendResult(db, messageId, result, alert));
  }
  const created = await bird.createConversationWithTemplate({
    phone: sub.phone,
    name: `Notis ${sub.userName ?? sub.phone}`,
    template,
    text: message.body,
    linkPath,
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
      linkPath,
      idempotencyKey: message.id,
    });
    return finish(await applySendResult(db, messageId, result, alert));
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
  return finish(await applySendResult(db, messageId, created, alert));
}

/**
 * The proactive send boundary — the rails in order, per PRD §6:
 * unsubscribed race → kill switch → proactive limit → send. Suppressions
 * land as status `suppressed` with the reason in failureReason, so the panel
 * shows exactly what a rail stopped and why.
 *
 * The unsubscribed and paused rails are enforced per row inside
 * deliverPendingMessage against live state; the batch-level checks here read
 * the same state once so a whole wake short-circuits with a single alert
 * instead of per message. The proactive limit belongs here, where the whole
 * wake is visible: it counts occasions, so it stops all of a wake's rows or
 * none of them.
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
    select: { id: true, deliveryMode: true },
  });

  // The proactive limit covers cold pushes only — template sends. processItem
  // checks it before the model too; this pass catches the reader whose window
  // shut, or whose budget filled, while the model ran.
  //
  // All of the wake or none of it. One wake is one occasion against the cap,
  // so there is no partial budget to spend, and half a story on the reader's
  // handset is worse than the whole story next week. decideDelivery gives
  // every row of a wake the same mode, so the template rows ARE the wake.
  if (rows.some((r) => r.deliveryMode === "template")) {
    const spent = await unrepliedTemplateSends(db, sub.id, messageIds);
    if (spent >= WEEKLY_TEMPLATE_CAP) {
      await suppressMessages(db, messageIds, PROACTIVE_LIMIT_REASON);
      return;
    }
  }

  const known = new Set(rows.map((r) => r.id));
  const pace = makeSendPacer();
  for (const id of messageIds) {
    if (!known.has(id)) continue;
    await pace(sub.id);
    await deliverPendingMessage(db, bird, id, sub, alert);
  }
}

/** Close an item without a model run, leaving a model-less wake row so the
 *  decision log shows what went unexamined and why. */
async function completeModelLessWake(
  db: PrismaClient,
  item: ClaimedItem,
  events: WakeEvent[],
  rationale: string,
): Promise<void> {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const primary = primaryEvent(ordered);
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

/**
 * Close a wake the proactive limit makes pointless, before any model spend.
 * The events are consumed: a slot opens only as the week rolls, and by then
 * this news is old — so a model-less wake row records what went unexamined.
 *
 * `spent` is the count that was actually measured, not the cap. A reader can
 * be past it (an enrollment intro, or a wake the boundary let through on a
 * race), and the rationale is read back by the next wake's decision log.
 */
async function skipCappedWake(
  db: PrismaClient,
  item: ClaimedItem,
  events: WakeEvent[],
  spent: number,
): Promise<void> {
  const what =
    events.length === 1
      ? "Μία ενημέρωση δεν εξετάστηκε"
      : `${events.length} ενημερώσεις δεν εξετάστηκαν`;
  await completeModelLessWake(
    db,
    item,
    events,
    `(σύστημα) ${what} — ο χρήστης έχει ${spent} αναπάντητα μηνύματα προτύπου ` +
      `αυτή την εβδομάδα (όριο ${WEEKLY_TEMPLATE_CAP}), οπότε δεν στέλνουμε άλλο.`,
  );
}

/** A queued non-reactive wake for an unsubscribed reader must not burn a
 *  model run whose every send the boundary would suppress anyway — and
 *  must not write a post-unsubscribe «send» decision into the log. */
async function skipUnsubscribedWake(
  db: PrismaClient,
  item: ClaimedItem,
  events: WakeEvent[],
): Promise<void> {
  await completeModelLessWake(
    db,
    item,
    events,
    "(σύστημα) Ο αναγνώστης απεγγράφηκε πριν τρέξει το wake — καταναλώθηκε χωρίς μοντέλο.",
  );
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
      // The proactive limit, before the model for the same reason: a wake
      // the boundary would suppress whole can only buy a decision entry the
      // rails then have to contradict — and pays for it.
      //
      // Only a cold push is capped, so the delivery mode decides whether to
      // even ask. The window can shut between here and the boundary (a
      // 30-60s model run, or an hour of sweeper retries), which is why the
      // boundary re-reads both halves rather than trusting this.
      const delivery = decideDelivery(
        primaryEvent(events),
        await lastWhatsAppInboundAt(db, item.subscriptionId),
        new Date(),
      );
      if (delivery.mode === "template") {
        const spent = await unrepliedTemplateSends(db, item.subscriptionId);
        if (spent >= WEEKLY_TEMPLATE_CAP) {
          await skipCappedWake(db, item, events, spent);
          return;
        }
      }
    }

    const sub = await db.notisSubscription.findUnique({ where: { id: item.subscriptionId } });
    if (!sub) {
      await markFailed(db, item.id, item.attempts, "subscription no longer exists");
      return;
    }
    // Reactive wakes still run for unsubscribed readers by design (a direct
    // message deserves an answer); queued NON-reactive work died with the
    // subscription — consume it without paying for a model run.
    if (sub.status === "unsubscribed" && !isReactiveWake(events)) {
      await skipUnsubscribedWake(db, item, events);
      return;
    }
    await runOneWake(db, item, sub, events, overrides);
    // The wake is done and its messages are already on the reader's handset,
    // so nobody waits for this: fold whatever has aged out of the windows.
    // Re-read the row — runOneWake may have moved the watermark's neighbours
    // and the status (a ΣΤΟΠ mid-wake). maybeCompact never throws.
    const after = await db.notisSubscription.findUnique({
      where: { id: sub.id },
      select: { id: true, status: true, memory: true, memoryThrough: true },
    });
    if (after) await maybeCompact(db, after, { deps: overrides.deps, alert });
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

  await sendSmsAndRecord(
    db,
    bird,
    message.id,
    sub.phone,
    message.body,
    alert,
    `held SMS ${message.id} failed on release`,
  );
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
    // Original order: unordered re-sends can reproduce the same-second
    // handset inversion SEND_SPACING_MS exists to prevent.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      body: true,
      createdAt: true,
      channel: true,
      failureReason: true,
      subscriptionId: true,
      wakeId: true,
      deliveryMode: true,
      template: true,
      proactive: true,
      railed: true,
      subscription: {
        select: { id: true, phone: true, userName: true, birdConversationId: true },
      },
    },
    take: 50,
  });
  const pace = makeSendPacer();

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
      // Give-up is a terminal WhatsApp failure like any other: the content
      // still deserves its second leg.
      if (message.channel === "whatsapp") {
        await maybeSendSmsFallback(db, bird, message, alert);
      }
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
    await pace(message.subscriptionId);
    await deliverPendingMessage(db, bird, message.id, message.subscription, alert);
  }
  return stale.length;
}
