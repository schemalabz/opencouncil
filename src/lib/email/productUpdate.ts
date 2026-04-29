"use server";

import { createHash } from 'crypto';
import { sendEmail, sendEmailBatch } from '@/lib/email/resend';
import { renderReactEmailToHtml } from '@/lib/email/render';
import { ProductUpdateEmail } from '@/lib/email/templates/ProductUpdateEmail';
import { fillProductUpdatePlaceholders } from '@/lib/email/templates/productUpdateDefault';
import { buildUnsubscribeUrl } from '@/lib/notifications/tokens';
import { getProductUpdateRecipients } from '@/lib/db/productUpdates';

const FROM_ADDRESS = 'OpenCouncil <notifications@opencouncil.gr>';
/** Resend's batch cap is 100; we split larger audiences across multiple calls. */
const BATCH_SIZE = 100;
/**
 * Floor between successive batch calls — Resend allows ~2 req/s on the batch
 * endpoint, so 500ms gives us a clean ceiling. The sleep only matters when a
 * batch round-trip itself comes back faster than 500ms.
 */
const BATCH_INTERVAL_MS = 500;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SendProductUpdateResult {
    sent: number;
    failed: number;
    failedEmails: string[];
}

async function renderForRecipient(
    bodyHtml: string,
    userName: string,
    unsubscribeUrl: string,
): Promise<string> {
    const filled = fillProductUpdatePlaceholders(bodyHtml, { userName, unsubscribeUrl });
    return renderReactEmailToHtml(ProductUpdateEmail({ bodyHtml: filled }));
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

/**
 * Deterministic idempotency key for a single batch — same subject + body + the
 * exact recipient set produces the same key, so a retried send (network blip,
 * pod restart) deduplicates at Resend's side within a 24h window.
 */
function makeIdempotencyKey(
    subject: string,
    bodyHtml: string,
    recipientEmails: string[],
): string {
    const data = JSON.stringify({ subject, bodyHtml, to: recipientEmails });
    return createHash('sha256').update(data).digest('hex');
}

/**
 * Send a product-update email to every consenting recipient using Resend's
 * batch endpoint. Per-recipient HTML is rendered up front in parallel, then
 * chunked into batches of 100 and dispatched concurrently. Each batch carries
 * a content-derived idempotency key so a server-side retry is deduped.
 *
 * `bodyHtml` is the editor-sanitized HTML with {{userName}}/{{unsubscribeUrl}}
 * placeholders intact; per-recipient substitution happens here.
 */
export async function sendProductUpdateToAll(params: {
    subject: string;
    bodyHtml: string;
}): Promise<SendProductUpdateResult> {
    const { subject, bodyHtml } = params;
    const recipients = await getProductUpdateRecipients();
    if (recipients.length === 0) {
        return { sent: 0, failed: 0, failedEmails: [] };
    }

    const prepared = await Promise.all(
        recipients.map(async (r) => {
            const unsubscribeUrl = await buildUnsubscribeUrl(r.userId, undefined, 'el');
            const html = await renderForRecipient(bodyHtml, r.name, unsubscribeUrl);
            return {
                from: FROM_ADDRESS,
                to: r.email,
                subject,
                html,
            };
        }),
    );

    const batches = chunk(prepared, BATCH_SIZE);
    let sent = 0;
    let failed = 0;
    const failedEmails: string[] = [];

    // Sequential dispatch with a 500ms floor between calls — Resend's batch
    // endpoint allows ~2 req/s, and a fast round-trip alone isn't enough
    // spacing. 10 batches finish in ~5s in the steady state.
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const result = await sendEmailBatch(batch, {
            idempotencyKey: makeIdempotencyKey(subject, bodyHtml, batch.map((b) => b.to)),
        });
        sent += batch.length - result.failedTos.length;
        failed += result.failedTos.length;
        failedEmails.push(...result.failedTos);
        if (!result.success) {
            console.error(`Product update batch ${i + 1}/${batches.length} failed:`, result.error);
        }
        if (i < batches.length - 1) {
            await sleep(BATCH_INTERVAL_MS);
        }
    }

    return { sent, failed, failedEmails };
}

/**
 * Send a preview of the product-update email to a single test address.
 * Uses the admin's own userId for the unsubscribe link so the full flow can
 * be previewed end-to-end; clicking the link unsubscribes the admin.
 */
export async function sendProductUpdateTest(params: {
    subject: string;
    bodyHtml: string;
    testEmail: string;
    testName?: string;
    adminUserId: string;
}): Promise<SendProductUpdateResult> {
    const { subject, bodyHtml, testEmail, testName, adminUserId } = params;
    try {
        const unsubscribeUrl = await buildUnsubscribeUrl(adminUserId, undefined, 'el');
        const html = await renderForRecipient(bodyHtml, testName ?? '', unsubscribeUrl);
        const result = await sendEmail({
            from: FROM_ADDRESS,
            to: testEmail,
            subject: `[TEST] ${subject}`,
            html,
        });
        if (result.success) {
            return { sent: 1, failed: 0, failedEmails: [] };
        }
        return { sent: 0, failed: 1, failedEmails: [testEmail] };
    } catch (error) {
        console.error(`Product update test send failed for ${testEmail}:`, error);
        return { sent: 0, failed: 1, failedEmails: [testEmail] };
    }
}
