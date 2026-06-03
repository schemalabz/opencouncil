import { NextResponse } from 'next/server';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { env } from '@/env.mjs';
import prisma from '@/lib/db/prisma';
import {
    findUserByNotificationDeliveryId,
    isUnsubscribeMessage,
    sendUnsubscribeReply,
    UNSUBSCRIBE_ALREADY_TEXT,
    UNSUBSCRIBE_CONFIRMATION_TEXT,
    UNSUBSCRIBE_RETRY_TEXT,
    unsubscribeUserPhoneFromAllCities,
    verifyUnsubscribeIntent,
} from '@/lib/notifications/unsubscribe';
import { sendUnsupportedReply } from '@/lib/notifications/autoReply';
import { normalizePhone } from '@/lib/notifications/phone';
import { markWebhookSeen, clearWebhookSeen } from '@/lib/notifications/webhookDedupe';
import type { VerifyRequestResult, VerifySignatureResult } from '@/lib/notifications/types';
import { extractMessageFields, type ExtractedMessageFields } from './extract';
import type { MessageStatus, Prisma } from '@prisma/client';

// Replay protection model (issue #391):
//   1. Verify the HMAC signature — proves the request came from Bird untampered.
//   2. Atomic id-based dedupe — record the event's stable id in Valkey
//      (`SET NX EX`); an exact replay/retry of the same event is dropped with
//      200 OK so Bird stops retrying. This is the PRIMARY replay defense.
//   3. Process (extract → persist → unsubscribe) only first-seen events.
// Time is no longer part of the security model. Bird's retry queue re-delivers
// webhooks with the original event timestamp (observed 3–4h stale), so a tight
// timestamp window dropped legitimate retries; the window below is now only a
// residual sanity ceiling against absurdly skewed clocks/signatures. It MUST
// stay well above Bird's retry staleness so legitimate retries pass signature
// verification and reach the id-dedupe layer (which returns 200 OK for true
// replays). Replay rejection is the dedupe layer's job, not this window's.
const SIGNATURE_HEADER = 'messagebird-signature';
const TIMESTAMP_HEADER = 'messagebird-request-timestamp';
const REPLAY_WINDOW_SECONDS = 24 * 60 * 60; // 24h sanity ceiling; id dedupe is primary

function verifyBirdSignature(opts: {
    rawBody: string;
    url: string;
    signatureHeader: string | null;
    timestampHeader: string | null;
    secret: string;
}): VerifySignatureResult {
    const { rawBody, url, signatureHeader, timestampHeader, secret } = opts;
    if (!signatureHeader) return { ok: false, reason: 'missing signature header' };
    if (!timestampHeader) return { ok: false, reason: 'missing timestamp header' };

    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' };

    // Verify HMAC first. The signature binds timestamp + url + body, so a
    // passing check already proves the request came from Bird untampered;
    // the freshness check below is only a sanity ceiling.
    const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest();
    const expected = createHmac('sha256', secret)
        .update(`${timestampHeader}\n${url}\n`, 'utf8')
        .update(bodyHash)
        .digest();

    const provided = Buffer.from(signatureHeader, 'base64');
    if (provided.length !== expected.length) return { ok: false, reason: 'length mismatch' };
    if (!timingSafeEqual(new Uint8Array(provided), new Uint8Array(expected))) {
        return { ok: false, reason: 'signature mismatch' };
    }

    const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (skew > REPLAY_WINDOW_SECONDS) return { ok: false, reason: `timestamp skew ${skew}s` };

    return { ok: true };
}

/**
 * Read + signature-verify + JSON-parse the incoming webhook request.
 * Returns the decoded event on success or a ready-to-return error response
 * (401 invalid signature, 400 invalid JSON, 500 unconfigured-in-prod).
 */
async function verifyRequest(request: Request): Promise<VerifyRequestResult> {
    const rawBody = await request.text();

    if (!env.BIRD_WEBHOOK_SECRET) {
        if (process.env.NODE_ENV === 'production') {
            console.error('Bird webhook: BIRD_WEBHOOK_SECRET not set in production — refusing');
            return {
                ok: false,
                response: NextResponse.json({ error: 'webhook not configured' }, { status: 500 }),
            };
        }
        console.warn('Bird webhook: BIRD_WEBHOOK_SECRET not set — accepting unsigned events (dev only)');
    } else {
        const proto = request.headers.get('x-forwarded-proto') ?? 'https';
        const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
        const origin = host ? `${proto}://${host}` : env.NEXTAUTH_URL;
        const signedUrl = new URL('/api/webhooks/bird', origin).toString();
        const result = verifyBirdSignature({
            rawBody,
            url: signedUrl,
            signatureHeader: request.headers.get(SIGNATURE_HEADER),
            timestampHeader: request.headers.get(TIMESTAMP_HEADER),
            secret: env.BIRD_WEBHOOK_SECRET,
        });
        if (!result.ok) {
            console.warn(`Bird webhook: signature verification failed — ${result.reason}`);
            return {
                ok: false,
                response: NextResponse.json({ error: 'invalid signature' }, { status: 401 }),
            };
        }
    }

    try {
        return { ok: true, event: JSON.parse(rawBody) };
    } catch {
        return {
            ok: false,
            response: NextResponse.json({ error: 'invalid JSON' }, { status: 400 }),
        };
    }
}


// Lifecycle rank: pending → sent → {delivered | failed}. Terminal statuses
// (delivered, failed) absorb. Used to reject replayed webhooks that would
// otherwise regress a message's status — see PR #389 / issue #391. Also
// makes the handler tolerant of out-of-order webhook delivery.
const STATUS_RANK: Record<MessageStatus, number> = {
    pending: 0,
    sent: 1,
    delivered: 2,
    failed: 2,
};

function isForwardProgression(current: MessageStatus, next: MessageStatus): boolean {
    if (current === 'delivered' || current === 'failed') return false;
    return STATUS_RANK[next] > STATUS_RANK[current];
}

async function updateOutboundMessage(fields: ExtractedMessageFields): Promise<boolean> {
    if (!fields.birdMessageId) return false;
    const existing = await prisma.message.findUnique({
        where: { birdMessageId: fields.birdMessageId },
    });
    if (!existing) return false;

    if (existing.status !== fields.status && isForwardProgression(existing.status, fields.status)) {
        await prisma.message.update({
            where: { id: existing.id },
            data: {
                status: fields.status,
                // Only persist a reason on failure; clear it otherwise.
                failureReason: fields.status === 'failed' ? fields.failureReason ?? null : null,
            },
        });
    }
    return true;
}


async function getNotificationDeliveryForMessage(
    fields: ExtractedMessageFields,
): Promise<string | null> {
    if (fields.direction !== 'inbound' || !fields.conversationId) return null;
    const lastWithDelivery = await prisma.message.findFirst({
        where: {
            conversationId: fields.conversationId,
            notificationDeliveryId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { notificationDeliveryId: true },
    });
    return lastWithDelivery?.notificationDeliveryId ?? null;
}


async function persistMessageRow(
    fields: ExtractedMessageFields,
    notificationDeliveryId: string | null,
): Promise<void> {
    await prisma.message.create({
        data: {
            channel: fields.channel,
            direction: fields.direction,
            birdMessageId: fields.birdMessageId,
            conversationId: fields.conversationId ?? null,
            phone: normalizePhone(fields.phone),
            body: fields.body,
            status: fields.status,
            failureReason: fields.status === 'failed' ? fields.failureReason ?? null : null,
            notificationDeliveryId,
        },
    });
}

/**
 * Two-stage unsubscribe handling for inbound WhatsApp messages with a
 * resolved delivery link:
 *   1. Regex keyword match (STOP / ΣΤΟΠ / απεγγραφή / etc.)
 *   2. LLM intent verification (rules out e.g. "stop the meeting")
 *
 * Returns true when the message was handled as an unsubscribe (action taken
 * or an unsubscribe-related reply sent), so the caller can skip the generic
 * "replies not supported" auto-reply. A keyword match that the LLM rejects
 * (e.g. "stop the meeting") is NOT an unsubscribe and returns false.
 */
async function handleUnsubscribeIfApplicable(
    fields: ExtractedMessageFields,
    notificationDeliveryId: string | null,
): Promise<boolean> {
    if (
        fields.direction !== 'inbound' ||
        fields.channel !== 'whatsapp' ||
        !notificationDeliveryId ||
        !isUnsubscribeMessage(fields.body)
    ) return false;

    const user = await findUserByNotificationDeliveryId(notificationDeliveryId);
    if (!user) {
        console.warn(
            `Bird webhook: unsubscribe keyword matched but no user resolved (delivery ${notificationDeliveryId})`,
        );
        return false;
    }

    if (normalizePhone(user.phone) !== normalizePhone(fields.phone)) {
        console.warn(
            `Bird webhook: unsubscribe phone mismatch — inbound from ${fields.phone}, user.phone ${user.phone} (user ${user.id}, delivery ${notificationDeliveryId}); ignoring`,
        );
        return false;
    }

    const intent = await verifyUnsubscribeIntent(fields.body);

    if (intent === 'rejected') {
        console.log(
            `Bird webhook: unsubscribe keyword matched but LLM rejected intent (user ${user.id}, delivery ${notificationDeliveryId})`,
        );
        return false;
    }

    if (intent === 'failed') {
        console.warn(
            `Bird webhook: LLM verification failed — asking user ${user.id} to retry (delivery ${notificationDeliveryId})`,
        );
        if (fields.conversationId) {
            await sendUnsubscribeReply({
                conversationId: fields.conversationId,
                phone: normalizePhone(fields.phone),
                notificationDeliveryId,
                text: UNSUBSCRIBE_RETRY_TEXT,
            });
        }
        return true;
    }

    const { changedCount } = await unsubscribeUserPhoneFromAllCities(user.id);
    const replyText = changedCount > 0 ? UNSUBSCRIBE_CONFIRMATION_TEXT : UNSUBSCRIBE_ALREADY_TEXT;
    console.log(
        changedCount > 0
            ? `Bird webhook: disabled phone notifications for user ${user.id} across ${changedCount} cities (delivery ${notificationDeliveryId})`
            : `Bird webhook: user ${user.id} already unsubscribed — sending reminder (delivery ${notificationDeliveryId})`,
    );
    if (fields.conversationId) {
        await sendUnsubscribeReply({
            conversationId: fields.conversationId,
            phone: normalizePhone(fields.phone),
            notificationDeliveryId,
            text: replyText,
        });
    }
    return true;
}

/**
 * For inbound WhatsApp messages we didn't otherwise act on, reply that we
 * don't support conversational replies yet (and how to unsubscribe).
 *
 * Unsubscribe-keyword messages are excluded even when `handleUnsubscribeIf-
 * Applicable` returned false (null delivery link, unresolved user, phone
 * mismatch). Telling someone who just sent "STOP" that replies aren't
 * supported would be the wrong message; those edge cases get no reply, as
 * before this feature.
 */
async function sendUnsupportedReplyIfApplicable(
    fields: ExtractedMessageFields,
    notificationDeliveryId: string | null,
): Promise<void> {
    if (
        fields.direction !== 'inbound' ||
        fields.channel !== 'whatsapp' ||
        !fields.conversationId ||
        isUnsubscribeMessage(fields.body)
    ) return;

    await sendUnsupportedReply({
        conversationId: fields.conversationId,
        channel: fields.channel,
        phone: normalizePhone(fields.phone),
        notificationDeliveryId,
    });
}

/**
 * Build the replay-dedupe id for an event. Bird emits multiple lifecycle
 * status webhooks for the same message id (sent → delivered → failed), so the
 * message id alone is too coarse — it would drop legitimate progressions. The
 * key composes every stable identifier we have: the top-level event/payload id
 * (when present), the message id, and the normalized status. A duplicate then
 * requires the exact same event — i.e. a true replay/retry — while status
 * progressions remain distinct keys.
 */
function buildDedupeId(event: unknown, fields: ExtractedMessageFields): string {
    const payloadId =
        (event as { payload?: { id?: string }; data?: { id?: string } } | null)?.payload?.id ??
        (event as { data?: { id?: string } } | null)?.data?.id ??
        '-';
    return `${payloadId}:${fields.birdMessageId ?? '-'}:${fields.status}`;
}

export async function POST(request: Request) {
    const verified = await verifyRequest(request);
    if (!verified.ok) return verified.response;

    const fields = extractMessageFields(verified.event, {
        sms: env.BIRD_SMS_CHANNEL_ID,
        whatsapp: env.BIRD_WHATSAPP_CHANNEL_ID,
    });
    if (!fields.birdMessageId || !fields.phone) {
        console.warn('Bird webhook: missing required fields, skipping insert');
        return NextResponse.json({ ok: true });
    }

    // Id-based replay protection (primary defense — see header). Atomic
    // check-and-set: a duplicate is dropped here so Bird stops retrying.
    const dedupeId = buildDedupeId(verified.event, fields);
    const seen = await markWebhookSeen(dedupeId);
    if (seen === 'duplicate') {
        console.log(`Bird webhook: webhook id ${dedupeId} already processed — skipping`);
        return NextResponse.json({ ok: true });
    }

    try {
        if (fields.direction === 'outbound' && await updateOutboundMessage(fields)) {
            return NextResponse.json({ ok: true });
        }

        const notificationDeliveryId = await getNotificationDeliveryForMessage(fields);
        await persistMessageRow(fields, notificationDeliveryId);
        const handledAsUnsubscribe = await handleUnsubscribeIfApplicable(fields, notificationDeliveryId);
        if (!handledAsUnsubscribe) {
            await sendUnsupportedReplyIfApplicable(fields, notificationDeliveryId);
        }
    } catch (error) {
        const code = (error as Prisma.PrismaClientKnownRequestError | undefined)?.code;
        if (code !== 'P2002') {
            console.error('Bird webhook: persist error', error);
            // Transient failure → return 500 so Bird retries. Roll back the
            // dedupe marker first; otherwise the retry would be dropped as a
            // duplicate and the event lost permanently.
            await clearWebhookSeen(dedupeId);
            return NextResponse.json({ error: 'persist failed' }, { status: 500 });
        }
    }

    return NextResponse.json({ ok: true });
}
