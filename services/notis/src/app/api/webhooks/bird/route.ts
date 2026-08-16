import { NextResponse, after } from "next/server";
import { env } from "@/env.mjs";
import { extractMessageFields } from "@/lib/bird-extract";
import { realBird } from "@/lib/bird";
import { hasNotisDb, notisDb } from "@/lib/db";
import { drainQueue } from "@/lib/queue";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyBirdSignature } from "@/lib/webhook-signature";
import { handleInbound, handleOutboundStatus } from "./handlers";

/**
 * Notis's own Bird webhook subscription — a SECOND subscription beside the
 * main app's, with its own signing key. Returns 200 fast: the wake runs
 * after the response (a wake takes 30–60s; Bird would time out and retry).
 * Non-2xx makes Bird retry, so transient DB errors return 500 on purpose.
 */

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!env.BIRD_WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      console.error("Bird webhook: BIRD_WEBHOOK_SECRET not set in production — refusing");
      return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
    }
    console.warn("Bird webhook: BIRD_WEBHOOK_SECRET not set — accepting unsigned events (dev only)");
  } else {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const result = verifyBirdSignature({
      rawBody,
      url: new URL("/api/webhooks/bird", `${proto}://${host}`).toString(),
      signatureHeader: request.headers.get(SIGNATURE_HEADER),
      timestampHeader: request.headers.get(TIMESTAMP_HEADER),
      secret: env.BIRD_WEBHOOK_SECRET,
    });
    if (!result.ok) {
      console.warn(`Bird webhook: signature verification failed — ${result.reason}`);
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!hasNotisDb()) return NextResponse.json({ ok: true, ignored: "no database" });

  const fields = extractMessageFields(event, { whatsapp: env.BIRD_WHATSAPP_CHANNEL_ID });
  if (fields.channel !== "whatsapp") {
    return NextResponse.json({ ok: true, ignored: "not whatsapp" });
  }

  const deps = { db: notisDb(), bird: realBird };
  try {
    if (fields.direction === "outbound") {
      await handleOutboundStatus(fields, deps);
      return NextResponse.json({ ok: true });
    }

    const result = await handleInbound(fields, deps);
    if (result.action === "enqueued") {
      after(() => drainQueue());
    }
    return NextResponse.json({ ok: true, action: result.action });
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code;
    // A unique-index race on birdMessageId is a concurrent duplicate
    // delivery, not a failure.
    if (code === "P2002") return NextResponse.json({ ok: true, action: "duplicate" });
    console.error("Bird webhook: handler error", error);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
