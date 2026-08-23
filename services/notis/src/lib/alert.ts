import { env } from "@/env.mjs";

/** A stalled webhook must never become a stalled caller: the janitor raises
 *  alarms next to a database lock, and the poller inside a tick. */
const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Operational alarm: always the error log, plus the alert webhook (e.g.
 * Discord) when configured. Never throws — an alarm about a failure must not
 * mask the failure itself — and never waits longer than WEBHOOK_TIMEOUT_MS.
 */
export async function alert(scope: string, message: string, emoji = "🚨"): Promise<void> {
  console.error(`[notis:${scope}] ${message}`);
  if (!env.NOTIS_ALERT_WEBHOOK_URL) return;
  await fetch(env.NOTIS_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `${emoji} notis ${scope}: ${message}` }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  }).catch((e) => console.error(`[notis:${scope}] alert webhook failed:`, e));
}
