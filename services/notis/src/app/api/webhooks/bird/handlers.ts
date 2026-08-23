import { seedProfileFromPreferences } from "@/agent/profileSeed";
import type { WakeEvent } from "@/agent/types";
import { isQuietHour } from "@/lib/active-hours";
import { alert as sendAlert } from "@/lib/alert";
import { BirdLike } from "@/lib/bird";
import { ExtractedMessageFields } from "@/lib/bird-extract";
import { citiesForUser, findEnabledUserByPhone } from "@/lib/fanout";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { normalizePhone } from "@/lib/phone";
import {
  SMS_HELD_FOR_QUIET_HOURS,
  sendPendingMessages,
  suppressPendingOutbound,
} from "@/lib/queue";
import { enqueueLiveWake } from "@/lib/queue-core";
import { STOP_ALREADY_TEXT, STOP_CONFIRMATION_TEXT, isBareStop } from "@/lib/stop";
import { renderTemplate, type TemplateName } from "@/agent/templates";
import { getProactiveSettings } from "@/lib/settings";
import type {
  MessageStatus,
  NotisMessage,
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
  // Suppressed rows never reached Bird, so no webhook can reference them;
  // ranked terminal for type completeness.
  suppressed: 3,
};

export function isForwardProgression(current: MessageStatus, next: MessageStatus): boolean {
  if (current === "read" || current === "failed" || current === "suppressed") return false;
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
  deps: HandlerDeps,
): Promise<InboundResult> {
  const { db } = deps;
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
        // `?? null` must come LAST: a `(x ?? null)?.slice()` on a missing
        // reason yields undefined, which Prisma reads as "leave unchanged" —
        // keeping a stale reason from an earlier failure.
        failureReason:
          fields.status === "failed" ? (fields.failureReason?.slice(0, 300) ?? null) : null,
      },
    });
    if (fields.status === "failed") {
      if (existing.channel === "sms") {
        // The SMS WAS the fallback — there is no next channel. The reader
        // missed a notification; the operator hears about it.
        await (deps.alert ?? ((m: string) => sendAlert("webhook", m)))(
          `SMS delivery failed for message ${existing.id}: ${fields.failureReason ?? "unknown error"}`,
        );
      } else {
        await maybeSendSmsFallback(existing, deps);
      }
    }
    return { action: "status-updated" };
  }
  return { action: "ignored", reason: "no forward progression" };
}

/**
 * The notify-only SMS fallback (PRD §6): when WhatsApp delivery of a
 * PROACTIVE template send fails, the same text goes out once as an SMS.
 * The sms row is inserted FIRST with fallbackForId unique on the failed
 * message — a replayed failure webhook loses the insert and stops, so one
 * failure can never fire two SMS. Skipped while paused; reactive replies
 * and freeform sends get no fallback (the reader is reachable on
 * WhatsApp — they just wrote to us there).
 *
 * Quiet hours hold it rather than drop it. Bird redelivers hours-old status
 * events and a handset can fail a message long after the send, so a template
 * that correctly went out at 22:40 can fail at 03:00 — and the fallback is
 * proactive, so it obeys the same 23:00-09:00 rail as everything else. The
 * row is written held; the sweeper releases it after the 09:00 boundary.
 */
async function maybeSendSmsFallback(
  failed: NotisMessage,
  { db, bird, alert }: HandlerDeps,
): Promise<void> {
  if (
    failed.channel !== "whatsapp" ||
    failed.deliveryMode !== "template" ||
    !failed.proactive ||
    !failed.template
  ) {
    return;
  }
  const settings = await getProactiveSettings(db);
  if (settings.paused) return;

  const sub = await db.notisSubscription.findUnique({ where: { id: failed.subscriptionId } });
  if (!sub?.phone || sub.status === "unsubscribed") return;

  const rendered = renderTemplate(failed.template as TemplateName, failed.body);
  const text = `${rendered.body}\n\n${rendered.footer}`;
  const held = isQuietHour(new Date());

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
        // Replaces a proactive template send; the rails follow it.
        railed: true,
        fallbackForId: failed.id,
        status: "pending",
        ...(held ? { failureReason: SMS_HELD_FOR_QUIET_HOURS } : {}),
      },
      select: { id: true },
    });
    smsId = sms.id;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return; // replayed webhook
    throw error;
  }

  // Held rows leave here pending; the sweeper sends them at the release.
  if (held) return;

  const result = await bird.sendSms({ phone: sub.phone, text });
  if (result.success) {
    await db.notisMessage.update({
      where: { id: smsId },
      data: { status: "sent", birdMessageId: result.messageId },
    });
  } else {
    // Never re-sent (the channels API has no idempotency key) — mark it
    // and alert; the reader misses one notification, not a conversation.
    await db.notisMessage.update({
      where: { id: smsId },
      data: { status: "failed", failureReason: (result.error ?? "unknown error").slice(0, 300) },
    });
    await (alert ?? ((m: string) => sendAlert("webhook", m)))(
      `SMS fallback failed for message ${failed.id}: ${result.error ?? "unknown error"}`,
    );
  }
}

/**
 * Inbound SMS for a phone notis serves. SMS exists here because our own
 * fallback footer says «ΣΤΟΠ για διακοπή» — so ΣΤΟΠ must work over SMS,
 * and any other reply deserves the agent, not a void. No enrollment on SMS
 * contact: an eligible first message enrolls via WhatsApp, never here.
 * Unknown phones stay ignored — the main app's webhook owns them.
 */
export async function handleSmsInbound(
  fields: ExtractedMessageFields,
  deps: HandlerDeps,
): Promise<InboundResult> {
  const { db } = deps;
  if (!fields.birdMessageId || !fields.phone) {
    return { action: "ignored", reason: "missing message id or phone" };
  }
  const duplicate = await db.notisMessage.findUnique({
    where: { birdMessageId: fields.birdMessageId },
    select: { id: true },
  });
  if (duplicate) return { action: "ignored", reason: "duplicate birdMessageId" };

  const found = await findSubscriptionByPhone(db, fields.phone);
  if (!found) return { action: "ignored", reason: "sms from a phone notis does not serve" };
  // The same gate as WhatsApp: a rolled-back user or a reassigned number
  // must not be agent-served — or unsubscribed by a stranger — over SMS.
  const gated = await gateExistingSubscription(db, found, fields.phone);
  if ("ignored" in gated) {
    return { action: "ignored", reason: gated.ignored };
  }
  const sub = gated.sub;

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
        channel: "sms",
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

/**
 * The main-DB gate for an EXISTING subscription, channel-agnostic: a
 * rolled-back user (notisEnabledAt cleared) is the main app's again, and a
 * number the user no longer owns is not the user — on WhatsApp or SMS.
 * Returns the (possibly phone-canonicalized) subscription or the ignore
 * reason. Fails open when the main DB is unreachable: dropping a served
 * reader's message is worse than a rare double answer during an outage.
 */
async function gateExistingSubscription(
  db: PrismaClient,
  sub: NotisSubscription,
  phone: string,
): Promise<{ sub: NotisSubscription } | { ignored: string }> {
  if (!hasMainDb()) return { sub };
  const user = await mainDb().notisUserRow.findUnique({
    where: { id: sub.userId },
    select: { notisEnabledAt: true, phone: true },
  });
  if (!user?.notisEnabledAt) {
    return { ignored: "user rolled back to the old path" };
  }
  // A number this reader no longer owns is not this reader. After a phone
  // change, the OLD number still matches the stored subscription here while
  // the main app's gate (which looks up User.phone) misses — treat it like
  // a rollback and stay silent; the new number self-heals through the
  // enrollment upsert.
  const current = normalizePhone(user.phone);
  if (current && current !== normalizePhone(phone)) {
    return { ignored: "message from a number the user no longer has" };
  }
  // Canonicalize a stored form that differs only by the leading "+": the
  // lookup accepts both, and later sends address whatever is stored.
  if (current && current !== sub.phone) {
    const updated = await db.notisSubscription.update({
      where: { id: sub.id },
      data: { phone: current },
    });
    return { sub: updated };
  }
  return { sub };
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
 * the decision row and the pending reply commit together; the reply itself
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
        channel: fields.channel,
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
    // Nothing queued may outlive a ΣΤΟΠ. The confirmation reply is created
    // below, after this statement, so it is the one outbound row that
    // survives.
    await suppressPendingOutbound(tx, sub.id);
    // A model-less wake row records the decision (the reader's text lives on
    // the inbound message row, the reply on its own row below — this is only
    // the "what happened and why"). model/trace stay null: no model ran.
    const rationale = alreadyUnsubscribed
      ? "(σύστημα) Επανέλαβε ΣΤΟΠ ενώ ήταν ήδη απεγγεγραμμένος — υπενθύμιση."
      : "(σύστημα) Έστειλε ΣΤΟΠ — άμεση απεγγραφή χωρίς αφύπνιση.";
    const event = { type: "user_message", at: at.toISOString(), text: fields.body };
    const wake = await tx.notisWake.create({
      data: {
        subscriptionId: sub.id,
        eventType: "user_message",
        eventAt: at,
        event: event as unknown as Prisma.InputJsonValue,
        decision: "send",
        rationale,
        outcome: {
          decision: "send",
          rationale,
          messages: [replyText],
          scheduledWakes: [],
          ...(alreadyUnsubscribed ? {} : { unsubscribe: { reason: "ΣΤΟΠ" } }),
        } as unknown as Prisma.InputJsonValue,
        deliveryMode: "freeform",
        costUsd: 0,
        durationMs: 0,
      },
      select: { id: true },
    });
    const reply = await tx.notisMessage.create({
      data: {
        subscriptionId: sub.id,
        wakeId: wake.id,
        direction: "outbound",
        channel: fields.channel,
        body: replyText,
        deliveryMode: "freeform",
        status: "pending",
      },
      select: { id: true },
    });
    return reply.id;
  });

  if (fields.channel === "sms") {
    // The reader is talking to us over SMS — confirm there. Single attempt,
    // no idempotency key (the channels API has none); a lost confirmation
    // does not undo the unsubscribe, which committed above.
    const notifyOps = alert ?? ((message: string) => sendAlert("webhook", message));
    if (!sub.phone) {
      await db.notisMessage.update({
        where: { id: replyId },
        data: { status: "failed", failureReason: "no phone on subscription" },
      });
      return { action: "stopped" };
    }
    const result = await bird.sendSms({ phone: sub.phone, text: replyText });
    await db.notisMessage.update({
      where: { id: replyId },
      data: result.success
        ? { status: "sent", birdMessageId: result.messageId }
        : {
            status: "failed",
            failureReason: (result.error ?? "unknown error").slice(0, 300),
          },
    });
    if (!result.success) {
      await notifyOps(
        `ΣΤΟΠ confirmation SMS failed for ${sub.id}: ${result.error ?? "unknown error"}`,
      );
    }
    return { action: "stopped" };
  }

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
    // The gate holds for EXISTING subscriptions too: answering a
    // rolled-back user here as well as in the main app would double-reply.
    const gated = await gateExistingSubscription(db, sub, fields.phone);
    if ("ignored" in gated) {
      return { action: "ignored", reason: gated.ignored };
    }
    sub = gated.sub;
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
