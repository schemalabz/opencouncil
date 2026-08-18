import { isRetryableStatus } from "../bird";

describe("isRetryableStatus", () => {
  it("treats 5xx and the two transient 4xx as retryable", () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    // 408 is a timeout and 429 a rate limit — both mean "later", not "never".
    // Classifying them terminal made a rate-limited reply unrecoverable,
    // because the sweeper only retries rows that are still pending.
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
  });

  it("treats the rest of 4xx as terminal", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });
});
