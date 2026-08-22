import { seedProfileFromPreferences } from "@/agent/profileSeed";
import type { WakeEvent } from "@/agent/types";
import { alert as sendAlert } from "@/lib/alert";
import { BirdLike } from "@/lib/bird";
import { ExtractedMessageFields } from "@/lib/bird-extract";
import { citiesForUser, findEnabledUserByPhone } from "@/lib/fanout";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { normalizePhone } from "@/lib/phone";
import { sendPendingMessages } from "@/lib/queue";
import { enqueueLiveWake } from "@/lib/queue-core";
import { STOP_ALREADY_TEXT, STOP_CONFIRMATION_TEXT, isBareStop } from "@/lib/stop";
import type {
  MessageStatus,
  NotisSubscription,
  Prisma,
  PrismaClient,
} from "../../../../../generated/client";

/**
 * The webhook's routing decisions, separated from the HTTP shell so tests
 * drive them with fakes. Two subscriptions (main app + notis) receive every
 * Bird conversation event during rollout; this side serves ONLY rollout-
 * enabled users and stays silent for everyone else — the main app's webhook
 * still answers old-path users and unknown numbers, and one inbound message
 * must never draw two replies.
 */

export interface HandlerDeps {
  db: PrismaClient;
  bird: BirdLike;
  alert?: (message: string) => Promise<void>;
}

export type InboundResult =
  | { action: "ignored"; reason: string }
  | { action: "status-updated" }
  | { action: "stopped" }
  | { action: "enqueued"; queueItemId: string };

// Delivery lifecycle rank: pending → sent → delivered → read; failed and
// read absorb. Rejects replayed/out-of-order webhooks that would regress a
// status (same defense as the main app, plus the real `read` state).
/**
 * Delivery is monotonic, and `failed` ranks with `sent`, not above
 * `delivered`: once Bird has told us the handset received a message, a later
 * failure event (a duplicate, or a retry of an earlier attempt) must not
 * rewrite that into a failure. Only a still-`sent` row can turn out to have
 * failed.
 */
const STATUS_RANK: Record<MessageStatus, number> = {
  pending: 0,
  sent: 1,
  failed: 2,
  delivered: 2,
  read: 3,
};

export function isForwardProgression(current: MessageStatus, next: MessageStatus): boolean {
  if (current === "read" || current === "failed") return false;
  // A failure report AFTER the handset confirmed delivery is a stale or
  // out-of-order replay (Bird redelivers hours-old events) — delivered can
  // only advance to read, same terminal-delivered defense as the main app.
  if (next === "failed" && current === "delivered") return false;
  return STATUS_RANK[next] > STATUS_RANK[current];
}

/** Outbound events: reconcile delivery status for a message notis sent.
 *  Unknown ids are the main app's messages — not ours to track. */
export async function handleOutboundStatus(
  fields: ExtractedMessageFields,
  { db }: HandlerDeps,
): Promise<InboundResult> {
  if (!fields.birdMessageId) return { action: "ignored", reason: "no birdMessageId" };
  const existing = await db.notisMessage.findUnique({
    where: { birdMessageId: fields.birdMessageId },
  });
  if (!existing || existing.direction !== "outbound") {
    return { action: "ignored", reason: "not a notis outbound message" };
  }
  if (existing.status && isForwardProgression(existing.status, fields.status)) {
    await db.notisMessage.update({
      where: { id: existing.id },
      data: {
        status: fields.status,
        // Only keep a reason on failure; clear it otherwise (same rule as
        // the main app's webhook).
        failureReason:
          fields.status === "failed" ? (fields.failureReason ?? null)?.slice(0, 300) : null,
      },
    });
    return { action: "status-updated" };
  }
  return { action: "ignored", reason: "no forward progression" };
}

async function findSubscriptionByPhone(
  db: PrismaClient,
  phone: string,
): Promise<NotisSubscription | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return db.notisSubscription.findFirst({
    where: { phone: { in: [normalized, normalized.slice(1)] } },
  });
}

/** Enroll a rollout-enabled user on their first inbound message: subscription
 *  with origin `inbound`, profile seeded exactly as migration will seed it.
 *  No transition template — they opened the conversation themselves.
 *
 *  Upsert on userId, not create: the serve-or-enroll decision is phone-keyed,
 *  so a user whose main-app phone changed after enrollment lands here with a
 *  subscription that exists under the old phone — the upsert refreshes the
 *  phone (and absorbs the first-contact double-text race) instead of dying
 *  on the unique constraint and dropping the message. */
async function enrollFromInbound(
  db: PrismaClient,
  fields: ExtractedMessageFields,
): Promise<NotisSubscription | null> {
  if (!hasMainDb()) return null;
  const user = await findEnabledUserByPhone(fields.phone!);
  if (!user) return null;

  const cities = await citiesForUser(user.id);
  return db.notisSubscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      phone: normalizePhone(fields.phone),
      status: "active",
      origin: "inbound",
      profileText: seedProfileFromPreferences(cities),
      userName: user.name,
      birdConversationId: fields.conversationId,
    },
    update: {
      phone: normalizePhone(fields.phone),
      ...(fields.conversationId ? { birdConversationId: fields.conversationId } : {}),
      ...(user.name ? { userName: user.name } : {}),
    },
  });
}

/**
 * The deterministic ΣΤΟΠ pre-step: a bare stop keyword flips the
 * subscription without waking the agent. The inbound row, the state flip,
 * the journal entry and the pending reply commit together; the reply itself
 * goes out after commit with the message row id as idempotency key.
 */
async function handleBareStop(
  sub: NotisSubscription,
  fields: ExtractedMessageFields,
  { db, bird, alert }: HandlerDeps,
): Promise<InboundResult> {
  const alreadyUnsubscribed = sub.status === "unsubscribed";
  const replyText = alreadyUnsubscribed ? STOP_ALREADY_TEXT : STOP_CONFIRMATION_TEXT;
  const at = new Date();

  const replyId = await db.$transaction(async (tx) => {
    await tx.notisMessage.create({
      data: {
        subscriptionId: sub.id,
        direction: "inbound",
        body: fields.body,
        birdMessageId: fields.birdMessageId,
      },
    });
    // Always touched: updatedAt is the conversation list's activity sort key.
    await tx.notisSubscription.update({
      where: { id: sub.id },
      data: {
        updatedAt: at,
        ...(alreadyUnsubscribed ? {} : { status: "unsubscribed" as const, unsubscribedAt: at }),
      },
    });
    const { _max } = await tx.notisJournalEntry.aggregate({
      where: { subscriptionId: sub.id },
      _max: { seq: true },
    });
    await tx.notisJournalEntry.create({
      data: {
        subscriptionId: sub.id,
        seq: (_max.seq ?? 0) + 1,
        entry: {
          at: at.toISOString(),
          event: "user_message",
          decision: "send",
          rationale: alreadyUnsubscribed
            ? "(σύστημα) Επανέλαβε ΣΤΟΠ ενώ ήταν ήδη απεγγεγραμμένος — υπενθύμιση."
            : "(σύστημα) Έστειλε ΣΤΟΠ — άμεση απεγγραφή χωρίς αφύπνιση.",
          messages: [replyText],
          received: fields.body,
          ...(alreadyUnsubscribed ? {} : { unsubscribed: true }),
        } as Prisma.InputJsonValue,
      },
    });
    const reply = await tx.notisMessage.create({
      data: {
        subscriptionId: sub.id,
        direction: "outbound",
        body: replyText,
        deliveryMode: "freeform",
        status: "pending",
      },
      select: { id: true },
    });
    return reply.id;
  });

  await sendPendingMessages(
    db,
    bird,
    [replyId],
    { id: sub.id, birdConversationId: fields.conversationId ?? sub.birdConversationId },
    alert ?? ((message) => sendAlert("webhook", message)),
  );
  return { action: "stopped" };
}

/** Inbound WhatsApp message → dedupe → gate → ΣΤΟΠ pre-step → enqueue. */
export async function handleInbound(
  fields: ExtractedMessageFields,
  deps: HandlerDeps,
): Promise<InboundResult> {
  const { db } = deps;
  if (!fields.birdMessageId || !fields.phone) {
    return { action: "ignored", reason: "missing message id or phone" };
  }

  // Bird retries webhooks with the original ids — the unique index on
  // birdMessageId backstops races between concurrent deliveries.
  const duplicate = await db.notisMessage.findUnique({
    where: { birdMessageId: fields.birdMessageId },
    select: { id: true },
  });
  if (duplicate) return { action: "ignored", reason: "duplicate birdMessageId" };

  let sub = await findSubscriptionByPhone(db, fields.phone);
  if (!sub) {
    sub = await enrollFromInbound(db, fields);
    if (!sub) {
      // Old-path user or unknown number: the main app's webhook answers
      // them; a second reply from here would double up.
      return { action: "ignored", reason: "not a notis-served phone" };
    }
  } else {
    // The gate holds for EXISTING subscriptions too: an admin rolling a
    // user back (clearing notisEnabledAt) hands their inbound to the main
    // app's webhook again — answering here as well would double-reply.
    // Fail open when the main DB is unreachable: dropping a served user's
    // message is worse than a rare double answer during an outage.
    if (hasMainDb()) {
      const user = await mainDb().notisUserRow.findUnique({
        where: { id: sub.userId },
        select: { notisEnabledAt: true, phone: true },
      });
      if (!user?.notisEnabledAt) {
        return { action: "ignored", reason: "user rolled back to the old path" };
      }
      // A number this reader no longer owns is not this reader. After a phone
      // change, the OLD number still matches the stored subscription here
      // while the main app's gate (which looks up User.phone) misses and
      // sends its unsupported-number reply — so the sender would get two
      // answers that contradict each other, on every message. Treat it like a
      // rollback and stay silent; the new number self-heals through the
      // enrollment upsert.
      const current = normalizePhone(user.phone);
      if (current && current !== normalizePhone(fields.phone)) {
        return { action: "ignored", reason: "message from a number the user no longer has" };
      }
      // Canonicalize the stored form when it differs only by the leading "+":
      // the lookup above accepts both, and later sends address whatever is
      // stored. A genuinely different number cannot reach here — it fails the
      // guard above, and the reader's new number self-heals through the
      // enrollment upsert instead.
      if (current && current !== sub.phone) {
        sub = await db.notisSubscription.update({
          where: { id: sub.id },
          data: { phone: current },
        });
      }
    }
    if (fields.conversationId && sub.birdConversationId !== fields.conversationId) {
      sub = await db.notisSubscription.update({
        where: { id: sub.id },
        data: { birdConversationId: fields.conversationId },
      });
    }
  }

  if (isBareStop(fields.body)) {
    return handleBareStop(sub, fields, deps);
  }

  const event: WakeEvent = {
    type: "user_message",
    at: new Date().toISOString(),
    text: fields.body,
  };
  const queueItemId = await db.$transaction(async (tx) => {
    await tx.notisMessage.create({
      data: {
        subscriptionId: sub.id,
        direction: "inbound",
        body: fields.body,
        birdMessageId: fields.birdMessageId,
      },
    });
    // Always touched: updatedAt is the conversation list's activity sort key.
    await tx.notisSubscription.update({
      where: { id: sub.id },
      data: { updatedAt: new Date() },
    });
    return enqueueLiveWake(tx, { subscriptionId: sub.id, event });
  });

  return { action: "enqueued", queueItemId };
}
