import { env } from "@/env.mjs";

/**
 * Operational alarm: always the error log, plus the alert webhook (e.g.
 * Discord) when configured. Never throws — an alarm about a failure must not
 * mask the failure itself.
 */
export async function alert(scope: string, message: string, emoji = "🚨"): Promise<void> {
  console.error(`[notis:${scope}] ${message}`);
  if (!env.NOTIS_ALERT_WEBHOOK_URL) return;
  await fetch(env.NOTIS_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `${emoji} notis ${scope}: ${message}` }),
  }).catch((e) => console.error(`[notis:${scope}] alert webhook failed:`, e));
}
