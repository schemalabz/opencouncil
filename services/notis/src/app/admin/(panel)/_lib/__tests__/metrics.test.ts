import { fmtTimeAgo } from "../format";
import { parseRange, pctChange } from "../metrics";

describe("parseRange", () => {
  it("accepts known ranges and defaults everything else to 7d", () => {
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("90d")).toBe("90d");
    expect(parseRange("1y")).toBe("7d");
    expect(parseRange(undefined)).toBe("7d");
  });
});

describe("pctChange", () => {
  it("computes relative change against the previous period", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(0, 100)).toBe(-100);
  });

  it("is null when the previous period is empty — no baseline, no percentage", () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
});

describe("fmtTimeAgo", () => {
  const now = new Date("2026-08-16T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("walks the ladder from now to dates", () => {
    expect(fmtTimeAgo(ago(30_000), now)).toBe("μόλις τώρα");
    expect(fmtTimeAgo(ago(5 * 60_000), now)).toBe("πριν 5′");
    expect(fmtTimeAgo(ago(60 * 60_000), now)).toBe("πριν 1 ώρα");
    expect(fmtTimeAgo(ago(3 * 60 * 60_000), now)).toBe("πριν 3 ώρες");
    expect(fmtTimeAgo(ago(30 * 60 * 60_000), now)).toMatch(/^χθες /);
    expect(fmtTimeAgo(ago(4 * 24 * 60 * 60_000), now)).toBe("πριν 4 ημέρες");
    expect(fmtTimeAgo(ago(10 * 24 * 60 * 60_000), now)).toBe("6/8/2026");
  });
});
