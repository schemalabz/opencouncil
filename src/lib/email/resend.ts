"use server";
import { Resend } from 'resend';
import { env } from '@/env.mjs';
import { emailFrom, type EmailSender } from '@/lib/email/senders';

interface Attachment {
    filename: string;
    content: Buffer | string;
    contentType?: string;
}

export interface EmailTag {
    name: string;
    value: string;
}

interface EmailParams {
    from: EmailSender;
    to: string;
    cc?: string | string[];
    replyTo?: string | string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: Attachment[];
    tags?: EmailTag[];
}

export interface BatchEmailItem {
    from: EmailSender;
    to: string;
    replyTo?: string | string[];
    subject: string;
    html: string;
    text?: string;
    tags?: EmailTag[];
}

export interface BatchEmailResult {
    success: boolean;
    failedTos: string[];
    error?: string;
}

/** Resend's per-call batch cap. `sendEmailInBatches` chunks to it. */
const RESEND_BATCH_LIMIT = 100;

/**
 * Pause between successive batch calls. Resend's batch endpoint allows about
 * two requests per second, and a fast round trip alone is not enough spacing.
 */
const RESEND_BATCH_INTERVAL_MS = 500;

/**
 * Apply the dev-email override to a single batch item — same rewrite as
 * `sendEmail` does for one-shot sends.
 */
function applyDevOverride(item: BatchEmailItem, override: string): BatchEmailItem {
    const banner = `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-family:monospace;font-size:13px;color:#92400e;">
        <strong>🔧 Dev Email Override</strong><br/>
        <strong>To:</strong> ${item.to}
    </div>`;
    return {
        from: item.from,
        to: override,
        replyTo: item.replyTo,
        subject: `[DEV → ${item.to}] ${item.subject}`,
        html: banner + item.html,
        text: item.text,
        tags: item.tags,
    };
}

export async function sendEmail(params: EmailParams) {
    const resend = new Resend(env.RESEND_API_KEY);
    let { from, to, cc, replyTo, subject, html, text, attachments, tags } = params;

    // Development/preview email override: redirect all emails to a single address
    const isDev = process.env.NODE_ENV !== 'production';
    const isPreview = env.DEPLOYMENT_ENV === 'preview';
    const devEmailOverride = env.DEV_EMAIL_OVERRIDE;

    if ((isDev || isPreview) && devEmailOverride) {
        const originalTo = to;
        const originalCc = cc;
        
        // Redirect email to dev address
        to = devEmailOverride;
        cc = undefined; // Clear CC to avoid sending to real addresses

        // Modify subject to include original recipient
        subject = `[DEV → ${originalTo}] ${subject}`;

        // Prepend a dev banner to the email body showing original recipients
        const ccList = originalCc ? (Array.isArray(originalCc) ? originalCc.join(', ') : originalCc) : 'none';
        const devBanner = `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-family:monospace;font-size:13px;color:#92400e;">
            <strong>🔧 Dev Email Override</strong><br/>
            <strong>To:</strong> ${originalTo}<br/>
            <strong>CC:</strong> ${ccList}
        </div>`;
        html = devBanner + html;

        // Log for debugging
        console.log(`📧 Dev mode: Redirecting email from "${originalTo}" to "${devEmailOverride}"`);
        if (originalCc) {
            console.log(`   Original CC: ${Array.isArray(originalCc) ? originalCc.join(', ') : originalCc}`);
        }
    }

    try {
        const result = await resend.emails.send({
            from: emailFrom(from),
            to,
            cc,
            replyTo,
            subject,
            html,
            text,
            attachments,
            tags,
        });

        if (result.error) {
            console.error('Failed to send email:', result);
            throw new Error("An error occurred while sending the email");
        }

        console.log('Email sent successfully:', result);
        return { success: true, message: 'Email sent successfully' };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, message: 'Failed to send email' };
    }
}

/**
 * Send up to 100 emails in a single Resend batch call. Returns a summary so
 * the caller can aggregate across multiple chunks. The `idempotencyKey`
 * dedupes retries for 24h on Resend's side — pass a deterministic key derived
 * from the batch's content + recipients, not a fresh UUID.
 *
 * Caller is responsible for chunking — a request bigger than 100 items is
 * rejected up-front rather than silently truncated.
 */
export async function sendEmailBatch(
    items: BatchEmailItem[],
    opts: { idempotencyKey: string },
): Promise<BatchEmailResult> {
    if (items.length === 0) return { success: true, failedTos: [] };
    if (items.length > RESEND_BATCH_LIMIT) {
        return {
            success: false,
            failedTos: items.map((i) => i.to),
            error: `Batch size ${items.length} exceeds Resend limit of ${RESEND_BATCH_LIMIT}`,
        };
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const isPreview = env.DEPLOYMENT_ENV === 'preview';
    const devEmailOverride = env.DEV_EMAIL_OVERRIDE;
    const useOverride = (isDev || isPreview) && !!devEmailOverride;

    const rewritten = useOverride
        ? items.map((i) => applyDevOverride(i, devEmailOverride!))
        : items;

    // Resend's HTTP API uses snake_case (`reply_to`); the SDK exposes camelCase
    // (`replyTo`). We use the SDK for one-shot sends and direct fetch here, so
    // translate just before serializing.
    const payload = rewritten.map(({ from, replyTo, ...rest }) => ({
        ...rest,
        from: emailFrom(from),
        ...(replyTo !== undefined ? { reply_to: replyTo } : {}),
    }));

    if (useOverride) {
        console.log(`📧 Dev mode: redirecting batch of ${items.length} to "${devEmailOverride}"`);
    }

    // Hit the batch endpoint directly: the pinned SDK (4.0.0) doesn't expose
    // an idempotency-key option, but Resend's HTTP API supports it via the
    // Idempotency-Key header.
    try {
        const response = await fetch('https://api.resend.com/emails/batch', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': opts.idempotencyKey,
                // Permissive mode: send the valid items in the batch and report
                // invalid ones individually via a top-level `errors[]`.
                'x-batch-validation': 'permissive',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`Resend batch send failed (${response.status}):`, errText);
            return {
                success: false,
                failedTos: items.map((i) => i.to),
                error: `Resend batch returned ${response.status}`,
            };
        }

        // Permissive mode response shape:
        //   { data: [{ id }, ...], errors: [{ index, message }, ...] }
        // `data` lists only successes; `errors[].index` points back at the
        // original input position, which is how we recover the failed `to`.
        const body = await response.json().catch(() => ({}));
        const errors: Array<{ index: number; message?: string }> =
            Array.isArray(body?.errors) ? body.errors : [];
        const failedTos = errors
            .map((e) => (typeof e.index === 'number' ? items[e.index]?.to : undefined))
            .filter((to): to is string => to !== undefined);
        if (failedTos.length > 0) {
            console.error(`Resend batch reported per-item errors:`, errors);
        }
        return { success: failedTos.length === 0, failedTos };
    } catch (error) {
        console.error('Resend batch send threw:', error);
        return {
            success: false,
            failedTos: items.map((i) => i.to),
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Send any number of emails through `sendEmailBatch`: chunk to Resend's limit,
 * send the chunks in order, and pause between calls.
 *
 * `onBatch` runs after each chunk, before the next one is sent, so a caller
 * records each outcome before the next send starts. Each caller derives its own
 * idempotency key and maps the result to its own records.
 */
export async function sendEmailInBatches<T>(
    items: T[],
    options: {
        toEmail: (item: T) => BatchEmailItem;
        idempotencyKey: (batch: T[]) => string;
        onBatch: (batch: T[], result: BatchEmailResult) => Promise<void> | void;
    },
): Promise<void> {
    for (let i = 0; i < items.length; i += RESEND_BATCH_LIMIT) {
        if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, RESEND_BATCH_INTERVAL_MS));
        }
        const batch = items.slice(i, i + RESEND_BATCH_LIMIT);
        const result = await sendEmailBatch(batch.map(options.toEmail), {
            idempotencyKey: options.idempotencyKey(batch),
        });
        await options.onBatch(batch, result);
    }
}
