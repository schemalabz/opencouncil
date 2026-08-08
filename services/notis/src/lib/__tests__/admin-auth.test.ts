import { mintToken, timingSafeEqual, verifyToken } from "../admin-auth";

describe("admin-auth", () => {
  const secret = "dev-secret-dev-secret";

  it("mints a stable token that verifies against the same secret", async () => {
    const token = await mintToken(secret);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyToken(token, secret)).toBe(true);
  });

  it("rejects wrong tokens, wrong secrets and missing tokens", async () => {
    const token = await mintToken(secret);
    expect(await verifyToken(token, "another-secret-entirely")).toBe(false);
    expect(await verifyToken("deadbeef", secret)).toBe(false);
    expect(await verifyToken(undefined, secret)).toBe(false);
  });

  it("timingSafeEqual handles equal, unequal and different-length strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
