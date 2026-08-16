import { fmtTimeAgo } from "../format";
import { fillSeries, listBuckets, parseRange, pctChange } from "../metrics";

describe("parseRange", () => {
  it("accepts known ranges and defaults everything else to 7d", () => {
    expect(parseRange("1h")).toBe("1h");
    expect(parseRange("24h")).toBe("24h");
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

describe("listBuckets", () => {
  it("covers the window inclusively in Athens-local days", () => {
    // 21:00 UTC prior day = 00:00 Athens next day (summer): the window
    // [Aug 9 22:00 UTC, Aug 16 10:00 UTC] spans Aug 10 … Aug 16 locally.
    const days = listBuckets(
      new Date("2026-08-09T22:00:00Z"),
      new Date("2026-08-16T10:00:00Z"),
      "day",
    );
    expect(days[0]).toBe("2026-08-10");
    expect(days[days.length - 1]).toBe("2026-08-16");
    expect(days).toHaveLength(7);
  });

  it("buckets a 24h window by hour with Athens-local keys (+03:00 in summer)", () => {
    const hours = listBuckets(
      new Date("2026-08-15T10:00:00Z"),
      new Date("2026-08-16T10:00:00Z"),
      "hour",
    );
    expect(hours[0]).toBe("2026-08-15T13:00");
    expect(hours[hours.length - 1]).toBe("2026-08-16T13:00");
    expect(hours).toHaveLength(25);
  });

  it("truncates hour keys to :00 even when the window starts mid-hour — they must match date_trunc", () => {
    const hours = listBuckets(
      new Date("2026-08-15T10:55:00Z"),
      new Date("2026-08-16T10:55:00Z"),
      "hour",
    );
    expect(hours[0]).toBe("2026-08-15T13:00");
    expect(hours.every((h) => h.endsWith(":00"))).toBe(true);
  });

  it("buckets an hour window by minute", () => {
    const minutes = listBuckets(
      new Date("2026-08-16T10:00:00Z"),
      new Date("2026-08-16T11:00:00Z"),
      "minute",
    );
    expect(minutes[0]).toBe("2026-08-16T13:00");
    expect(minutes).toHaveLength(61);
  });
});

describe("fillSeries", () => {
  it("zero-fills buckets without rows so charts get every bucket", () => {
    const series = fillSeries(
      new Date("2026-08-14T00:00:00Z"),
      new Date("2026-08-16T10:00:00Z"),
      "day",
      {
        sent: [{ key: "2026-08-15", count: 3 }],
        received: [],
        activeUsers: [{ key: "2026-08-15", count: 1 }],
        unsubscribes: [],
      },
    );
    expect(series.map((p) => p.sent)).toEqual([0, 3, 0]);
    expect(series.map((p) => p.received)).toEqual([0, 0, 0]);
    expect(series.find((p) => p.key === "2026-08-15")?.activeUsers).toBe(1);
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
