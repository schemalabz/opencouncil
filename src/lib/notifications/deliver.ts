import "server-only";

import { createHash } from 'crypto';
import { sendEmailBatch } from '@/lib/email/resend';
import { getPendingDeliveries, updateDeliveryStatus } from '@/lib/db/notifications';

const FROM_ADDRESS = 'OpenCouncil <notifications@opencouncil.gr>';
const EMAIL_BATCH_SIZE = 100;
// Space successive batch calls so a multi-batch release stays under Resend's
// per-key request rate limit. A rejected batch leaves its deliveries pending,
// so the spacing saves a re-release rather than the notifications themselves.
const BATCH_DELAY_MS = 500;

// Derive the delivery row shape from the DB function — keeps us honest if the
// include shape ever changes, without redeclaring the type.
type PendingDelivery = Awaited<ReturnType<typeof getPendingDeliveries>>[number];

interface EmailPayload {
    from: string;
    to: string;
    subject: string;
    html: string;
}

/**
 * Release notifications by sending all pending deliveries.
 *
 * Emails go through Resend's batch endpoint in chunks of 100, so a release of
 * thousands of recipients consumes only a handful of API calls instead of
 * thousands of sequential per-recipient sends with 500ms gaps. That sequential
 * loop used to saturate the Resend rate limit for our shared API key, starving
 * auth magic-link emails for minutes — see issue #380.
 *
 * Only email is sent from here. WhatsApp and SMS are Notis's for every
 * reader, so a `message` delivery can only be a row created before the
 * switch, and it is marked skipped, never sent.
 */
export async function releaseNotifications(notificationIds: string[]): Promise<{
    success: boolean;
    emailsSent: number;
    skipped: number;
    failed: number;
    leftPending: number;
}> {
    let emailsSent = 0;
    let skipped = 0;
    let failed = 0;
    let leftPending = 0;

    try {
        // Get all pending deliveries for these notifications
        const pendingDeliveries = await getPendingDeliveries(notificationIds);

        console.log(`Releasing ${pendingDeliveries.length} pending deliveries for ${notificationIds.length} notifications`);

        // Partition by medium up front so emails can be batched.
        const emailDeliveries = pendingDeliveries.filter((d) => d.medium === 'email');
        const messageDeliveries = pendingDeliveries.filter((d) => d.medium === 'message');

        // ---- Emails: batch send via Resend ----
        const emailResult = await sendEmailDeliveriesBatched(emailDeliveries);
        emailsSent += emailResult.sent;
        failed += emailResult.failed;
        leftPending += emailResult.leftPending;

        // Messages are Notis's: a `message` row predates the switch and is never sent.
        for (const delivery of messageDeliveries) {
            await updateDeliveryStatus(delivery.id, 'skipped');
            skipped++;
        }

        console.log(`Release complete: ${emailsSent} emails, ${skipped} skipped, ${failed} failed (${leftPending} left pending)`);

        return {
            success: true,
            emailsSent,
            skipped,
            failed,
            leftPending
        };
    } catch (error) {
        console.error('Error releasing notifications:', error);
        return {
            success: false,
            emailsSent,
            skipped,
            failed,
            leftPending
        };
    }
}

/**
 * Build the Resend payload for a single email delivery, or return null if the
 * delivery is missing required fields (in which case the delivery is marked
 * failed as a side effect, matching the pre-batch behaviour).
 */
async function buildEmailPayload(delivery: PendingDelivery): Promise<EmailPayload | null> {
    if (!delivery.email || !delivery.title || !delivery.body) {
        console.error('Missing email, title, or body for delivery', delivery.id);
        await updateDeliveryStatus(delivery.id, 'failed');
        return null;
    }
    return {
        from: FROM_ADDRESS,
        to: delivery.email,
        subject: delivery.title,
        html: delivery.body,
    };
}

/**
 * Chunk email deliveries into batches of 100 and send each batch via Resend's
 * batch endpoint. Per-delivery status writes preserve the same granularity as
 * the old sequential loop: any address Resend reports as failed (permissive
 * mode `errors[]`) is marked `failed`, the rest are marked `sent`.
 */
async function sendEmailDeliveriesBatched(deliveries: PendingDelivery[]): Promise<{
    sent: number;
    failed: number;
    leftPending: number;
}> {
    let sent = 0;
    let failed = 0;
    let leftPending = 0;

    // Pair each successfully-built payload with its delivery so we can map
    // batch results back to delivery ids. Deliveries that fail validation
    // here are already marked failed inside buildEmailPayload.
    const prepared: Array<{ delivery: PendingDelivery; payload: EmailPayload }> = [];
    for (const delivery of deliveries) {
        const payload = await buildEmailPayload(delivery);
        if (payload) {
            prepared.push({ delivery, payload });
        } else {
            failed++;
        }
    }

    for (let i = 0; i < prepared.length; i += EMAIL_BATCH_SIZE) {
        // Pause between batches (not before the first, not after the last) to
        // avoid bursting past Resend's request rate limit on large releases.
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }

        const chunk = prepared.slice(i, i + EMAIL_BATCH_SIZE);
        const payloads = chunk.map((p) => p.payload);
        const idempotencyKey = makeBatchIdempotencyKey(chunk.map((p) => p.delivery.id));

        const result = await sendEmailBatch(payloads, { idempotencyKey });

        // `error` marks a failure of the whole batch (429, 5xx, network): Resend
        // rejected no recipient in particular. Keep these rows `pending` so a
        // re-release retries them. `failed` is final, because getPendingDeliveries
        // selects only `pending` rows. They still count as failed for this release.
        if (result.error) {
            console.error(`Notification email batch failed; ${chunk.length} deliveries stay pending:`, result.error);
            failed += chunk.length;
            leftPending += chunk.length;
            continue;
        }

        // Resend reports failures as a list of `to` addresses (count == #fails).
        // If two deliveries target the same address and only one fails, the
        // address appears once. Consume the list as a multiset so we mark the
        // right number of rows failed instead of every match.
        const failureBudget = new Map<string, number>();
        for (const to of result.failedTos) {
            failureBudget.set(to, (failureBudget.get(to) ?? 0) + 1);
        }

        for (const { delivery, payload } of chunk) {
            const remaining = failureBudget.get(payload.to) ?? 0;
            if (remaining > 0) {
                failureBudget.set(payload.to, remaining - 1);
                await updateDeliveryStatus(delivery.id, 'failed');
                console.error(`Failed to send email to ${payload.to}`);
                failed++;
            } else {
                await updateDeliveryStatus(delivery.id, 'sent');
                sent++;
            }
        }

        if (!result.success) {
            console.error(`Notification email batch had per-recipient failures:`, result.failedTos);
        }
    }

    return { sent, failed, leftPending };
}

/**
 * Deterministic idempotency key from the set of delivery ids in the batch.
 * A retried release with the same deliveries will dedupe inside Resend's 24h
 * window — important because each delivery row is a single "send this once"
 * commitment.
 */
function makeBatchIdempotencyKey(deliveryIds: string[]): string {
    const data = JSON.stringify({ kind: 'notification-release', ids: [...deliveryIds].sort() });
    return createHash('sha256').update(data).digest('hex');
}
