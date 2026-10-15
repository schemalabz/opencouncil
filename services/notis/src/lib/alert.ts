import { env } from "@/env.mjs";

/** A stalled webhook must never become a stalled caller: the janitor raises
 *  alarms next to a database lock, and the poller inside a tick. */
const WEBHOOK_TIMEOUT_MS = 5_000;

/** Post one line to the alert webhook (e.g. Discord), when one is set.
 *  Never throws, and never waits longer than WEBHOOK_TIMEOUT_MS. */
async function post(scope: string, message: string, emoji: string): Promise<void> {
  if (!env.NOTIS_ALERT_WEBHOOK_URL) return;
  await fetch(env.NOTIS_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // An alert can quote text from outside, such as an error message. An
    // «@everyone» in it must not ping the channel, so Discord parses no
    // mention at all.
    body: JSON.stringify({
      content: `${emoji} notis ${scope}: ${message}`,
      allowed_mentions: { parse: [] },
    }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  }).catch((e) => console.error(`[notis:${scope}] alert webhook failed:`, e));
}

/**
 * Operational alarm: always the error log, plus the alert webhook (e.g.
 * Discord) when configured. Never throws — an alarm about a failure must not
 * mask the failure itself — and never waits longer than WEBHOOK_TIMEOUT_MS.
 */
export async function alert(scope: string, message: string, emoji = "🚨"): Promise<void> {
  console.error(`[notis:${scope}] ${message}`);
  await post(scope, message, emoji);
}

/**
 * Operational news that is not a failure, such as a support request that a
 * reader opened. It goes to the same webhook only: the caller writes its
 * own log line. Never throws, the same as alert().
 */
export async function notify(scope: string, message: string, emoji = "📮"): Promise<void> {
  await post(scope, message, emoji);
}
