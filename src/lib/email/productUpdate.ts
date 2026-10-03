"use server";

import { createHash } from 'crypto';
import { sendEmail, sendEmailInBatches, type BatchEmailItem, type EmailTag } from '@/lib/email/resend';
import { renderReactEmailToHtml } from '@/lib/email/render';
import { ProductUpdateEmail } from '@/lib/email/templates/ProductUpdateEmail';
import { fillProductUpdatePlaceholders } from '@/lib/email/templates/productUpdateDefault';
import { buildUnsubscribeUrl } from '@/lib/notifications/tokens';
import { getProductUpdateRecipients } from '@/lib/db/productUpdates';

const REPLY_TO = 'hello@opencouncil.gr';

const CATEGORY_TAG = { name: 'category', value: 'product-update' } as const;

function customLabelTags(labels: string[] | undefined): EmailTag[] {
    if (!labels?.length) return [];
    return labels.map((value) => ({ name: 'label', value }));
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
 * batch endpoint. Per-recipient HTML is rendered up front in parallel, then sent
 * through `sendEmailInBatches`. Each batch carries a content-derived idempotency
 * key so a server-side retry is deduped.
 *
 * `bodyHtml` is the editor-sanitized HTML with {{userName}}/{{unsubscribeUrl}}
 * placeholders intact; per-recipient substitution happens here.
 */
export async function sendProductUpdateToAll(params: {
    subject: string;
    bodyHtml: string;
    customTags?: string[];
}): Promise<SendProductUpdateResult> {
    const { subject, bodyHtml, customTags } = params;
    const recipients = await getProductUpdateRecipients();
    if (recipients.length === 0) {
        return { sent: 0, failed: 0, failedEmails: [] };
    }

    const extraTags = customLabelTags(customTags);
    const prepared = await Promise.all(
        recipients.map(async (r): Promise<BatchEmailItem> => {
            const unsubscribeUrl = await buildUnsubscribeUrl(r.userId, { locale: 'el' });
            const html = await renderForRecipient(bodyHtml, r.name, unsubscribeUrl);
            return {
                from: 'notifications',
                to: r.email,
                replyTo: REPLY_TO,
                subject,
                html,
                tags: [
                    CATEGORY_TAG,
                    { name: 'send-type', value: 'bulk' },
                    { name: 'user-id', value: r.userId },
                    ...extraTags,
                ],
            };
        }),
    );

    let sent = 0;
    let failed = 0;
    const failedEmails: string[] = [];

    await sendEmailInBatches(prepared, {
        toEmail: (item) => item,
        idempotencyKey: (batch) => makeIdempotencyKey(subject, bodyHtml, batch.map((b) => b.to)),
        onBatch: (batch, result) => {
            sent += batch.length - result.failedTos.length;
            failed += result.failedTos.length;
            failedEmails.push(...result.failedTos);
            if (!result.success) {
                console.error('Product update batch failed:', result.error);
            }
        },
    });

    return { sent, failed, failedEmails };
}

/**
 * Send a preview of the product-update email to a single test address.
 * Uses the admin's own userId for the unsubscribe link so the full flow can
 * be previewed end-to-end;
 */
export async function sendProductUpdateTest(params: {
    subject: string;
    bodyHtml: string;
    testEmail: string;
    testName?: string;
    adminUserId: string;
    customTags?: string[];
}): Promise<SendProductUpdateResult> {
    const { subject, bodyHtml, testEmail, testName, adminUserId, customTags } = params;
    try {
        const unsubscribeUrl = await buildUnsubscribeUrl(adminUserId, { locale: 'el' });
        const html = await renderForRecipient(bodyHtml, testName ?? '', unsubscribeUrl);
        const result = await sendEmail({
            from: 'notifications',
            to: testEmail,
            replyTo: REPLY_TO,
            subject: `[TEST] ${subject}`,
            html,
            tags: [
                CATEGORY_TAG,
                { name: 'send-type', value: 'test' },
                { name: 'user-id', value: adminUserId },
                ...customLabelTags(customTags),
            ],
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
