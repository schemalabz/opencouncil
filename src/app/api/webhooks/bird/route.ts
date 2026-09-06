import { NextResponse } from 'next/server';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { env } from '@/env.mjs';
import prisma from '@/lib/db/prisma';
import type { VerifyRequestResult, VerifySignatureResult } from '@/lib/notifications/types';
import { extractMessageFields, type ExtractedMessageFields } from './extract';
import type { MessageStatus } from '@prisma/client';

const SIGNATURE_HEADER = 'messagebird-signature';
const TIMESTAMP_HEADER = 'messagebird-request-timestamp';
// Wide sanity ceiling, not the primary replay defense. Bird's retry queue
// re-delivers webhooks with the original event timestamp (observed: 3–4h
// stale), which the previous 300s window was silently rejecting and losing
// real user messages. Proper replay protection should come from id-based
// dedupe — see follow-up ticket.
const REPLAY_WINDOW_SECONDS = 24 * 60 * 60;

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

/**
 * This app's half of the Bird webhook: the delivery status of a message it
 * sent itself (the admin test-send tools), reconciled onto its Message row.
 *
 * Everything else belongs to the Notis webhook subscription, which receives
 * the same events and serves every reader: inbound messages, ΣΤΟΠ, and the
 * status of Notis's own sends (their ids are unknown here). A ΣΤΟΠ is
 * therefore recorded in Notis alone, and this app's notifyByPhone follows
 * through the profile switch, never from here. A message from a phone no
 * reader has draws silence from both subscriptions, by design.
 */
export async function POST(request: Request) {
    const verified = await verifyRequest(request);
    if (!verified.ok) return verified.response;

    const fields = extractMessageFields(verified.event, {
        sms: env.BIRD_SMS_CHANNEL_ID,
        whatsapp: env.BIRD_WHATSAPP_CHANNEL_ID,
    });
    if (!fields.birdMessageId || !fields.phone) {
        console.warn('Bird webhook: missing required fields, skipping');
        return NextResponse.json({ ok: true });
    }

    if (fields.direction === 'outbound') {
        await updateOutboundMessage(fields);
    }

    return NextResponse.json({ ok: true });
}
