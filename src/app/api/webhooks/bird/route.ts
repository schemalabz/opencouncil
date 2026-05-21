import { NextResponse } from 'next/server';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { env } from '@/env.mjs';
import prisma from '@/lib/db/prisma';
import { mapBirdMessageStatus } from '@/lib/notifications/bird-status';
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
import { normalizePhone } from '@/lib/notifications/phone';
import type { Prisma, MessageDirection, MessageChannel, MessageStatus } from '@prisma/client';

const SIGNATURE_HEADER = 'messagebird-signature';
const TIMESTAMP_HEADER = 'messagebird-request-timestamp';
const REPLAY_WINDOW_SECONDS = 300;

type VerifyResult = { ok: true } | { ok: false; reason: string };

function verifyBirdSignature(opts: {
    rawBody: string;
    url: string;
    signatureHeader: string | null;
    timestampHeader: string | null;
    secret: string;
}): VerifyResult {
    const { rawBody, url, signatureHeader, timestampHeader, secret } = opts;
    if (!signatureHeader) return { ok: false, reason: 'missing signature header' };
    if (!timestampHeader) return { ok: false, reason: 'missing timestamp header' };

    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' };
    const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (skew > REPLAY_WINDOW_SECONDS) return { ok: false, reason: `timestamp skew ${skew}s` };

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
    return { ok: true };
}

/**
 * Defensive subset of a Bird webhook message. The Conversations API has
 * shifted field names between versions/events, so we union the variants
 * we've actually seen rather than commit to one. Optional everywhere —
 * fall-through chains below tolerate any single field being absent.
 */
interface BirdMessageLike {
    id?: string;
    messageId?: string;
    conversationId?: string;
    conversation_id?: string;
    channelId?: string;
    channel?: string;
    direction?: string;
    kind?: string;
    status?: string;
    reason?: string;
    failure?: { description?: string };
    sender?: {
        type?: string;
        identifierValue?: string;
        phone?: string;
        contact?: {
            identifierValue?: string;
            platformAddress?: string;
        };
    };
    from?: string | { identifierValue?: string; phone?: string };
    contact?: { identifierValue?: string };
    participant?: { identifierValue?: string };
    preview?: { text?: string };
    body?: string | { text?: string | { text?: string } };
    text?: string;
    // Outbound events: sender is `type: "flow"` (us) with no phone — the
    // recipient phone lives here instead.
    recipients?: Array<{ identifierValue?: string }>;
}

interface BirdWebhookPayload {
    id?: string;
    channelId?: string;
    lastMessage?: BirdMessageLike;
    message?: BirdMessageLike;
    // Outbound events fall back to this when `lastMessage.recipients` is
    // missing: the participant with `type: "contact"` is the user.
    featuredParticipants?: Array<{ type?: string; contact?: { identifierValue?: string } }>;
}

interface BirdWebhookEvent {
    event?: string;
    payload?: BirdWebhookPayload;
    data?: BirdWebhookPayload;
}

/** Extract plain text from Bird's variant body shape (string | nested object). */
function extractBodyText(body: BirdMessageLike['body']): string | undefined {
    if (!body || typeof body === 'string') return undefined;
    if (body.text && typeof body.text === 'object' && typeof body.text.text === 'string') {
        return body.text.text;
    }
    if (typeof body.text === 'string') return body.text;
    return undefined;
}

function extractMessageFields(event: unknown): {
    birdMessageId?: string;
    conversationId?: string;
    direction: MessageDirection;
    phone?: string;
    body: string;
    channel: MessageChannel;
    status: MessageStatus;
    failureReason?: string;
} {
    const evt = (event ?? {}) as BirdWebhookEvent;
    const eventName = String(evt.event ?? '');
    // The wrapper may put the conversation/message under `payload` or `data`,
    // or send it as the top-level body. Treat all three as the payload shape;
    // the cast is safe because every read below is optional-chained.
    const payload: BirdWebhookPayload = evt.payload ?? evt.data ?? (evt as BirdWebhookPayload);

    let m: BirdMessageLike | undefined;
    let conversationId: string | undefined;
    let payloadChannelId: string | undefined;

    if (eventName === 'conversation.updated' && payload.lastMessage) {
        m = payload.lastMessage;
        conversationId = payload.id; // payload IS the conversation here
        payloadChannelId = payload.channelId;
    } else {
        // Some payloads put message fields at the root; treat payload as a
        // message in that fallback.
        m = payload.message ?? (payload as BirdMessageLike);
        conversationId = m.conversationId ?? m.conversation_id;
        payloadChannelId = m.channelId ?? payload.channelId;
    }

    const explicitDirection = String(m?.direction ?? m?.kind ?? '').toLowerCase();
    const senderType = String(m?.sender?.type ?? '').toLowerCase();
    const direction: MessageDirection =
        explicitDirection.includes('out') ? 'outbound' :
        explicitDirection.includes('in') ? 'inbound' :
        senderType === 'contact' ? 'inbound' :
        senderType ? 'outbound' :
        'inbound';

    // `from` can be either a string phone or an object with identifier/phone.
    // Narrow once so the chain below stays readable.
    const fromObj = m?.from && typeof m.from === 'object' ? m.from : undefined;
    const fromStr = typeof m?.from === 'string' ? m.from : undefined;

    // Outbound fallbacks: when the sender is us (`type: "flow"`), the
    // recipient phone lives on the message's `recipients` array or on the
    // conversation's `featuredParticipants` (whichever participant is the
    // contact). Without these, every outbound `conversation.updated` event
    // gets dropped at the `!fields.phone` guard and status reconciliation
    // never runs.
    const recipientPhone = m?.recipients?.[0]?.identifierValue;
    const featuredContactPhone = payload.featuredParticipants
        ?.find((p) => p?.type === 'contact')
        ?.contact?.identifierValue;

    const phone =
        m?.sender?.contact?.identifierValue ??
        m?.sender?.contact?.platformAddress ??
        fromObj?.identifierValue ??
        fromObj?.phone ??
        fromStr ??
        m?.sender?.identifierValue ??
        m?.contact?.identifierValue ??
        m?.sender?.phone ??
        m?.participant?.identifierValue ??
        recipientPhone ??
        featuredContactPhone;

    const body =
        m?.preview?.text ??
        extractBodyText(m?.body) ??
        m?.text ??
        (typeof m?.body === 'string' ? m.body : '');

    let channel: MessageChannel = 'whatsapp';
    if (payloadChannelId && payloadChannelId === env.BIRD_SMS_CHANNEL_ID) {
        channel = 'sms';
    } else if (payloadChannelId && payloadChannelId === env.BIRD_WHATSAPP_CHANNEL_ID) {
        channel = 'whatsapp';
    } else if (String(m?.channel ?? '').toLowerCase().includes('sms')) {
        channel = 'sms';
    }

    return {
        birdMessageId: m?.id ?? m?.messageId,
        conversationId,
        direction,
        phone,
        body,
        channel,
        status: mapBirdMessageStatus(m?.status),
        failureReason: m?.reason ?? m?.failure?.description ?? undefined,
    };
}

export async function POST(request: Request) {
    const rawBody = await request.text();

    if (!env.BIRD_WEBHOOK_SECRET) {
        if (process.env.NODE_ENV === 'production') {
            console.error('Bird webhook: BIRD_WEBHOOK_SECRET not set in production — refusing');
            return NextResponse.json({ error: 'webhook not configured' }, { status: 500 });
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
            return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
        }
    }

    let event: unknown;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
    }

    const fields = extractMessageFields(event);
    if (!fields.birdMessageId || !fields.phone) {
        console.warn('Bird webhook: missing required fields, skipping insert');
        return NextResponse.json({ ok: true });
    }

    if (fields.direction === 'outbound') {
        const existing = await prisma.message.findUnique({
            where: { birdMessageId: fields.birdMessageId },
        });
        if (existing) {
            if (existing.status !== fields.status) {
                await prisma.message.update({
                    where: { id: existing.id },
                    data: {
                        status: fields.status,
                        // Only persist a reason on failure; clear it otherwise.
                        failureReason: fields.status === 'failed' ? fields.failureReason ?? null : null,
                    },
                });
            }
            return NextResponse.json({ ok: true });
        }
    }

    // For inbound rows, find the most recent message in this conversation
    // (either direction) that's already linked to a NotificationDelivery and
    // copy that link onto this row.
    let notificationDeliveryId: string | null = null;
    if (fields.direction === 'inbound' && fields.conversationId) {
        const lastWithDelivery = await prisma.message.findFirst({
            where: {
                conversationId: fields.conversationId,
                notificationDeliveryId: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            select: { notificationDeliveryId: true },
        });
        notificationDeliveryId = lastWithDelivery?.notificationDeliveryId ?? null;
    }

    // Idempotent insert (inbound, or outbound where the row didn't exist).
    try {
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

        // Unsubscribe detection — only for inbound WhatsApp messages with a
        // resolved delivery link.
        if (
            fields.direction === 'inbound' &&
            fields.channel === 'whatsapp' &&
            notificationDeliveryId &&
            isUnsubscribeMessage(fields.body)
        ) {
            const user = await findUserByNotificationDeliveryId(notificationDeliveryId);
            if (!user) {
                console.warn(
                    `Bird webhook: unsubscribe keyword matched but no user resolved (delivery ${notificationDeliveryId})`,
                );
            } else {
                if (normalizePhone(user.phone) !== normalizePhone(fields.phone)) {
                    console.warn(
                        `Bird webhook: unsubscribe phone mismatch — inbound from ${fields.phone}, user.phone ${user.phone} (user ${user.id}, delivery ${notificationDeliveryId}); ignoring`,
                    );
                } else {
                    const intent = await verifyUnsubscribeIntent(fields.body);
                    if (intent === 'rejected') {
                        console.log(
                            `Bird webhook: unsubscribe keyword matched but LLM rejected intent (user ${user.id}, delivery ${notificationDeliveryId})`,
                        );
                    } else if (intent === 'failed') {
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
                    } else {
                        const { changedCount } = await unsubscribeUserPhoneFromAllCities(user.id);
                        const replyText = changedCount > 0
                            ? UNSUBSCRIBE_CONFIRMATION_TEXT
                            : UNSUBSCRIBE_ALREADY_TEXT;
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
                    }
                }
            }
        }
    } catch (error) {
        const code = (error as Prisma.PrismaClientKnownRequestError | undefined)?.code;
        if (code !== 'P2002') {
            console.error('Bird webhook: persist error', error);
            // Returning 500 makes Bird retry — appropriate for transient DB issues.
            return NextResponse.json({ error: 'persist failed' }, { status: 500 });
        }
    }

    return NextResponse.json({ ok: true });
}
