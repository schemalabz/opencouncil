/**
 * Send a signed synthetic Bird inbound event to a local notis dev server —
 * the whole inbound path (signature → gate → ΣΤΟΠ pre-step → queue → wake)
 * without Bird or a tunnel.
 *
 *   npx tsx --env-file=.env scripts/send-test-webhook.ts <phone> <text> [url]
 *
 * The phone must belong to a rollout-enabled user (User.notisEnabledAt set)
 * for the agent to answer; any other phone is ignored by design. The url
 * defaults to http://localhost:3001/api/webhooks/bird. Signs with
 * BIRD_WEBHOOK_SECRET when set; without it the dev server accepts unsigned
 * events anyway.
 */
import { randomUUID } from "node:crypto";
import { signBirdWebhook } from "../src/lib/webhook-signature";

async function main() {
  const [phone, text, urlArg] = process.argv.slice(2);
  if (!phone || !text) {
    console.error('usage: npx tsx --env-file=.env scripts/send-test-webhook.ts <phone> <text> [url]');
    process.exit(1);
  }
  const url = urlArg ?? "http://localhost:3001/api/webhooks/bird";

  const rawBody = JSON.stringify({
    event: "conversation.updated",
    payload: {
      id: `test-conv-${phone.replace(/\D/g, "")}`,
      channelId: process.env.BIRD_WHATSAPP_CHANNEL_ID ?? "test-whatsapp-channel",
      lastMessage: {
        id: `test-msg-${randomUUID()}`,
        direction: "inbound",
        status: "delivered",
        sender: { type: "contact", contact: { identifierValue: phone } },
        body: { text: { text } },
      },
    },
  });

  // The route reconstructs the signed URL from x-forwarded-proto/host, so
  // send those explicitly and sign the exact same string.
  const target = new URL(url);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-proto": target.protocol.replace(":", ""),
    "x-forwarded-host": target.host,
  };
  const secret = process.env.BIRD_WEBHOOK_SECRET;
  if (secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    headers["messagebird-request-timestamp"] = timestamp;
    headers["messagebird-signature"] = signBirdWebhook({
      rawBody,
      url: new URL("/api/webhooks/bird", target.origin).toString(),
      timestamp,
      secret,
    });
  }

  const response = await fetch(url, { method: "POST", headers, body: rawBody });
  console.log(response.status, await response.text());
}

void main();
