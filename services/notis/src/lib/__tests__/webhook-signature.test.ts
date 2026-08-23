import { signBirdWebhook, verifyBirdSignature } from "../webhook-signature";

const SECRET = "test-signing-key";
const URL = "https://notis.opencouncil.gr/api/webhooks/bird";
const BODY = JSON.stringify({ event: "message.created", payload: { message: { id: "m1" } } });

function signedAt(now: Date) {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = signBirdWebhook({ rawBody: BODY, url: URL, timestamp, secret: SECRET });
  return { timestamp, signature };
}

describe("verifyBirdSignature", () => {
  const now = new Date("2026-08-16T12:00:00Z");

  it("accepts a correctly signed request", () => {
    const { timestamp, signature } = signedAt(now);
    expect(
      verifyBirdSignature({
        rawBody: BODY,
        url: URL,
        signatureHeader: signature,
        timestampHeader: timestamp,
        secret: SECRET,
        now,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const { timestamp, signature } = signedAt(now);
    const result = verifyBirdSignature({
      rawBody: BODY + "x",
      url: URL,
      signatureHeader: signature,
      timestampHeader: timestamp,
      secret: SECRET,
      now,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a different signed URL (the subscription URL is part of the HMAC)", () => {
    const { timestamp, signature } = signedAt(now);
    const result = verifyBirdSignature({
      rawBody: BODY,
      url: "https://opencouncil.gr/api/webhooks/bird",
      signatureHeader: signature,
      timestampHeader: timestamp,
      secret: SECRET,
      now,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const { timestamp, signature } = signedAt(now);
    const result = verifyBirdSignature({
      rawBody: BODY,
      url: URL,
      signatureHeader: signature,
      timestampHeader: timestamp,
      secret: "other-key",
      now,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects missing headers with distinct reasons", () => {
    expect(
      verifyBirdSignature({
        rawBody: BODY,
        url: URL,
        signatureHeader: null,
        timestampHeader: "1",
        secret: SECRET,
        now,
      }),
    ).toEqual({ ok: false, reason: "missing signature header" });
    expect(
      verifyBirdSignature({
        rawBody: BODY,
        url: URL,
        signatureHeader: "sig",
        timestampHeader: null,
        secret: SECRET,
        now,
      }),
    ).toEqual({ ok: false, reason: "missing timestamp header" });
  });

  it("accepts stale-but-signed events inside the 24h ceiling (Bird replays hours late)", () => {
    const eventTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const { timestamp, signature } = signedAt(eventTime);
    expect(
      verifyBirdSignature({
        rawBody: BODY,
        url: URL,
        signatureHeader: signature,
        timestampHeader: timestamp,
        secret: SECRET,
        now,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects timestamps beyond the 24h ceiling", () => {
    const eventTime = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const { timestamp, signature } = signedAt(eventTime);
    const result = verifyBirdSignature({
      rawBody: BODY,
      url: URL,
      signatureHeader: signature,
      timestampHeader: timestamp,
      secret: SECRET,
      now,
    });
    expect(result.ok).toBe(false);
  });
});
