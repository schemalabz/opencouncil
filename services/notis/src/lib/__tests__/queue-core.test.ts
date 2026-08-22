import { MAX_ATTEMPTS, retryDelayMs } from "../queue-core";

describe("retryDelayMs", () => {
  it("grows with the attempt, so retries do not all land in one drain", () => {
    // Without a delay, failItem re-pends with runAfter unchanged and the same
    // drain loop claims it again — all three attempts hitting one outage, so
    // a thirty-second blip dropped the message for good.
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(4 * 60_000);
    expect(retryDelayMs(3)).toBe(9 * 60_000);
  });

  it("does not grow past the last attempt", () => {
    expect(retryDelayMs(MAX_ATTEMPTS + 5)).toBe(retryDelayMs(MAX_ATTEMPTS));
  });
});
