import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bird webhook signature verification, ported from the main app's
 * src/app/api/webhooks/bird/route.ts. Pure: the route passes headers and
 * the reconstructed URL in; nothing here reads env or the request.
 *
 * Scheme: HMAC-SHA256 with the subscription's signing key over
 * `${timestamp}\n${url}\n` followed by the raw sha256 digest of the body,
 * compared against the base64 `messagebird-signature` header.
 */

export const SIGNATURE_HEADER = "messagebird-signature";
export const TIMESTAMP_HEADER = "messagebird-request-timestamp";

// Wide sanity ceiling, not the primary replay defense: Bird's retry queue
// re-delivers webhooks with the original event timestamp (observed 3–4h
// stale in the main app). Replay protection comes from birdMessageId dedupe.
export const REPLAY_WINDOW_SECONDS = 24 * 60 * 60;

export type VerifySignatureResult = { ok: true } | { ok: false; reason: string };

export function verifyBirdSignature(opts: {
  rawBody: string;
  url: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  secret: string;
  now?: Date;
}): VerifySignatureResult {
  const { rawBody, url, signatureHeader, timestampHeader, secret } = opts;
  if (!signatureHeader) return { ok: false, reason: "missing signature header" };
  if (!timestampHeader) return { ok: false, reason: "missing timestamp header" };

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid timestamp" };

  // Verify the HMAC first. The signature binds timestamp + url + body, so a
  // passing check already proves the request came from Bird untampered; the
  // freshness check below is only a sanity ceiling.
  const bodyHash = createHash("sha256").update(rawBody, "utf8").digest();
  const expected = createHmac("sha256", secret)
    .update(`${timestampHeader}\n${url}\n`, "utf8")
    .update(bodyHash)
    .digest();

  const provided = Buffer.from(signatureHeader, "base64");
  if (provided.length !== expected.length) return { ok: false, reason: "length mismatch" };
  if (!timingSafeEqual(new Uint8Array(provided), new Uint8Array(expected))) {
    return { ok: false, reason: "signature mismatch" };
  }

  const nowSeconds = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const skew = Math.abs(nowSeconds - ts);
  if (skew > REPLAY_WINDOW_SECONDS) return { ok: false, reason: `timestamp skew ${skew}s` };

  return { ok: true };
}

/** Compute the header value Bird would send — for tests and the dev script. */
export function signBirdWebhook(opts: {
  rawBody: string;
  url: string;
  timestamp: string;
  secret: string;
}): string {
  const bodyHash = createHash("sha256").update(opts.rawBody, "utf8").digest();
  return createHmac("sha256", opts.secret)
    .update(`${opts.timestamp}\n${opts.url}\n`, "utf8")
    .update(bodyHash)
    .digest("base64");
}
