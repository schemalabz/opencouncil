import { env } from "@/env.mjs";

/**
 * Minimal Bird (WhatsApp) client: free-form text into an existing
 * conversation. PR 3 sends only replies inside the 24h customer-service
 * window that the reader's own message opened, so templates, SMS and
 * conversation creation stay in the main app until PR 4.
 *
 * Every send carries an Idempotency-Key derived from the wake id: the wake
 * row is committed before Bird is called, so a retry of the send path
 * replays the same key and Bird returns the original message instead of
 * delivering twice.
 */

export interface BirdSendResult {
  success: boolean;
  messageId?: string;
  status?: number;
  error?: string;
  /** A retry with the same idempotency key can succeed: network errors and
   *  5xx. False for 4xx, Bird-side rejections and missing configuration. */
  retryable?: boolean;
}

export interface BirdLike {
  sendText(input: {
    conversationId: string;
    text: string;
    idempotencyKey: string;
  }): Promise<BirdSendResult>;
}

/**
 * Which HTTP statuses are worth retrying with the same idempotency key. 5xx
 * plus the two transient 4xx: 408 is a timeout and 429 is a rate limit, and
 * both say "later", not "never". Classifying them terminal made a
 * rate-limited reply unrecoverable, because the sweeper only retries rows
 * that are still `pending`.
 */
/** No Bird call may outlive this. The sweeper's claim uses the same value as
 *  its staleness window, so a hung send is retaken exactly once it can no
 *  longer be in flight. */
export const SEND_TIMEOUT_MS = 30_000;

export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export function hasBird(): boolean {
  return Boolean(env.BIRD_API_KEY && env.BIRD_WORKSPACE_ID && env.BIRD_WHATSAPP_CHANNEL_ID);
}

interface BirdResponseEnvelope {
  id?: string;
  status?: string;
  detail?: string;
  title?: string;
}

export const realBird: BirdLike = {
  async sendText({ conversationId, text, idempotencyKey }) {
    if (!hasBird()) {
      return {
        success: false,
        retryable: false,
        error: "Bird is not configured (BIRD_* env vars missing)",
      };
    }
    const url = `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/conversations/${conversationId}/messages`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `AccessKey ${env.BIRD_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          participantId: env.BIRD_WHATSAPP_CHANNEL_ID,
          participantType: "flow",
          body: { type: "text", text: { text } },
        }),
        // A send that never returns would otherwise hold its claim until the
        // claim goes stale, and before claims existed it was the one
        // unbounded outbound call in the service.
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Bird send failed (${response.status}):`, errorText);
        return {
          success: false,
          status: response.status,
          retryable: isRetryableStatus(response.status),
          error: `API returned ${response.status}: ${errorText}`,
        };
      }

      const envelope = ((await response.json()) ?? {}) as BirdResponseEnvelope;
      // A 2xx body can still carry an immediate failure status.
      if (envelope.status === "failed" || envelope.status === "rejected") {
        return {
          success: false,
          retryable: false,
          error: envelope.detail || envelope.title || `Bird status: ${envelope.status}`,
        };
      }
      return { success: true, messageId: envelope.id };
    } catch (error) {
      console.error("Bird send error:", error);
      return {
        success: false,
        retryable: true,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
