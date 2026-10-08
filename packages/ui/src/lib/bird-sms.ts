/**
 * The Bird SMS channel: the request and the reading of its answer, shared by
 * the main app (the phone verification code) and Notis (the SMS fallback).
 * Two senders, one rule: a message is sent when Bird answers 2xx with a
 * message id and no immediate failure status.
 */

export function birdSmsEndpoint(workspaceId: string, channelId: string): string {
    return `https://api.bird.com/workspaces/${workspaceId}/channels/${channelId}/messages`;
}

export function birdSmsPayload(phone: string, text: string) {
    return {
        receiver: { contacts: [{ identifierValue: phone }] },
        body: { type: 'text', text: { text } },
    };
}

export type BirdSmsReceipt =
    | { sent: true; messageId: string }
    /** `retryable`: the same send may succeed later (5xx, 408, 429). */
    | { sent: false; reason: string; retryable: boolean };

/** 5xx, 408 and 429 say "later", not "never". */
export function isRetryableBirdStatus(status: number): boolean {
    return status >= 500 || status === 408 || status === 429;
}

/**
 * Bird's free text with any phone number hidden: the reason goes to logs and
 * operator alerts, which must not carry a number. Seven digits or more, with
 * the spaces, dashes and plus a number is written with, read as one.
 */
export function redactPhones(text: string): string {
    return text.replace(/\+?(?:\d[\s().-]?){7,}\d/g, '[number]');
}

/** What Bird's answer says about the SMS. `body` is the parsed JSON, or null when there was none. */
export function readBirdSmsReceipt(status: number, body: unknown): BirdSmsReceipt {
    const envelope =
        typeof body === 'object' && body !== null
            ? (body as { id?: unknown; status?: unknown; code?: unknown; message?: unknown; detail?: unknown; title?: unknown })
            : null;
    if (status < 200 || status >= 300) {
        // Bird's own code and message, never the raw body: the body can echo the number.
        const said = [envelope?.code, envelope?.message ?? envelope?.detail ?? envelope?.title]
            .filter((part): part is string => typeof part === 'string' && part.length > 0)
            .map(redactPhones)
            .join(' — ');
        return {
            sent: false,
            reason: said ? `HTTP ${status}: ${said}` : `HTTP ${status}`,
            retryable: isRetryableBirdStatus(status),
        };
    }
    // A 2xx body can still carry an immediate failure status.
    if (envelope?.status === 'failed' || envelope?.status === 'rejected') {
        const detail =
            typeof envelope.detail === 'string'
                ? envelope.detail
                : typeof envelope.title === 'string'
                  ? envelope.title
                  : `Bird status: ${envelope.status}`;
        return { sent: false, reason: redactPhones(detail), retryable: false };
    }
    // Sent means Bird's own receipt: a message id. A 2xx without one (a
    // proxy's error page) is not a send.
    if (typeof envelope?.id !== 'string') {
        return { sent: false, reason: `HTTP ${status}, no message id`, retryable: false };
    }
    return { sent: true, messageId: envelope.id };
}
