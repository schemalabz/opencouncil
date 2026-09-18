import { fmtPct, fmtTimeAgo } from "../format";
import {
  MIN_SENDS_FOR_RATE,
  cumulativeReplyRates,
  deltaFor,
  fillSeries,
  listBuckets,
  parseRange,
  pctChange,
  pointsChange,
  replyRate,
} from "../metrics";

describe("parseRange", () => {
  it("accepts known ranges and defaults everything else to 7d", () => {
    expect(parseRange("1h")).toBe("1h");
    expect(parseRange("24h")).toBe("24h");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("90d")).toBe("90d");
    expect(parseRange("1y")).toBe("7d");
    expect(parseRange(undefined)).toBe("7d");
  });

  it("rejects prototype-chain keys — ?range=constructor must not crash the overview", () => {
    expect(parseRange("constructor")).toBe("7d");
    expect(parseRange("toString")).toBe("7d");
    expect(parseRange("valueOf")).toBe("7d");
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

  it("emits every local day across the spring-forward DST transition", () => {
    // 2026-03-30T21:30Z = 00:30 Athens Mar 31 (EEST). A fixed-24h stride
    // used to skip 2026-03-29 entirely, silently dropping its counts.
    const days = listBuckets(
      new Date("2026-03-23T21:30:00Z"),
      new Date("2026-03-30T21:30:00Z"),
      "day",
    );
    expect(days).toContain("2026-03-29");
    for (let i = 1; i < days.length; i++) {
      const gapMs = Date.parse(`${days[i]}T12:00:00Z`) - Date.parse(`${days[i - 1]}T12:00:00Z`);
      expect(gapMs).toBe(24 * 60 * 60 * 1000);
    }
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
        newsWakesSent: [{ key: "2026-08-15", count: 4 }],
        newsWakesAnswered: [{ key: "2026-08-15", count: 1 }],
        errors: [{ key: "2026-08-16", count: 2 }],
      },
    );
    expect(series.map((p) => p.sent)).toEqual([0, 3, 0]);
    expect(series.map((p) => p.received)).toEqual([0, 0, 0]);
    expect(series.find((p) => p.key === "2026-08-15")?.activeUsers).toBe(1);
    expect(series.map((p) => p.newsWakesSent)).toEqual([0, 4, 0]);
    expect(series.map((p) => p.newsWakesAnswered)).toEqual([0, 1, 0]);
    expect(series.map((p) => p.errors)).toEqual([0, 0, 2]);
  });
});

describe("replyRate", () => {
  it("is the share of news sends the reader answered", () => {
    expect(replyRate(4, 1)).toBe(0.25);
    expect(replyRate(3, 3)).toBe(1);
  });

  it("is null when no news went out, so the card says so instead of showing 0%", () => {
    expect(replyRate(0, 0)).toBeNull();
  });
});

describe("fmtPct", () => {
  it("keeps one decimal, so a rate does not round away the movement it tracks", () => {
    expect(fmtPct(0.0542, true)).toBe("5,4%");
    expect(fmtPct(0.0558, true)).toBe("5,6%");
  });

  it("pins the decimal on a round number too — the card must not change width", () => {
    expect(fmtPct(0.05, true)).toBe("5,0%");
    expect(fmtPct(1, true)).toBe("100,0%");
  });

  it("drops a trailing zero when the caller did not ask to pin it", () => {
    expect(fmtPct(0.05)).toBe("5%");
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

describe("pointsChange", () => {
  it("reads a rate's move in points, not as a share of itself", () => {
    // 4,8% → 2,5% over five replies. As a relative change this prints
    // «↓ 48%», which describes a rounding difference as a collapse.
    expect(pointsChange(0.0249, 0.0479)).toBeCloseTo(-2.3, 1);
    expect(pointsChange(0.5, 0.25)).toBeCloseTo(25, 5);
    expect(pointsChange(0.03, 0.03)).toBe(0);
  });
});

describe("cumulativeReplyRates", () => {
  const point = (newsWakesSent: number, newsWakesAnswered: number) => ({
    newsWakesSent,
    newsWakesAnswered,
  });

  it("carries the rate forward, so a bucket that sent nothing keeps the line", () => {
    const running = cumulativeReplyRates([point(20, 2), point(0, 0), point(20, 6)]);

    expect(running.map((r) => r.rate)).toEqual([0.1, 0.1, 0.2]);
    expect(running.map((r) => `${r.answered}/${r.sent}`)).toEqual(["2/20", "2/20", "8/40"]);
  });

  it("has no rate before the first send, rather than a zero nobody earned", () => {
    const running = cumulativeReplyRates([point(0, 0), point(0, 0), point(40, 10)]);

    expect(running.map((r) => r.rate)).toEqual([null, null, 0.25]);
  });

  it("draws no rate while the denominator is too thin to carry one", () => {
    // A first bucket of 1/1 is 100%, which would set the chart's whole scale
    // from a single reply and squash the settled rate onto the floor.
    const thin = cumulativeReplyRates([point(1, 1), point(1, 0)]);
    expect(thin.map((r) => r.rate)).toEqual([null, null]);

    const enough = cumulativeReplyRates([point(MIN_SENDS_FOR_RATE, 1)]);
    expect(enough[0].rate).toBeCloseTo(1 / MIN_SENDS_FOR_RATE, 10);
  });

  it("ends on the period figure the card prints above it", () => {
    const series = [point(120, 2), point(0, 0), point(81, 3)];

    const running = cumulativeReplyRates(series);

    const last = running[running.length - 1];
    expect(last.sent).toBe(201);
    expect(last.answered).toBe(5);
    // The card's headline comes from replyRate() over the same period totals,
    // so the chart's last point and the number above it are one calculation.
    expect(last.rate).toBe(replyRate(201, 5));
  });
});

describe("deltaFor", () => {
  it("calls an absent baseline new, never a rise from zero", () => {
    // replyRate() returns null when nothing went out. Reading that as 0%
    // turns the first period after a recess into a confident green rise.
    expect(deltaFor({ current: 0.0249, previous: null, unit: "percent" })).toEqual({ kind: "new" });
    expect(deltaFor({ current: null, previous: 0.048, unit: "percent" })).toEqual({ kind: "new" });
    expect(deltaFor({ current: null, previous: null, unit: "percent" })).toEqual({ kind: "none" });
  });

  it("reports a rate in points and a count in percent", () => {
    expect(deltaFor({ current: 0.0249, previous: 0.0479, unit: "percent" })).toMatchObject({
      kind: "move",
      up: false,
      unit: "points",
    });
    const rate = deltaFor({ current: 0.0249, previous: 0.0479, unit: "percent" });
    expect(rate.kind === "move" && rate.magnitude).toBeCloseTo(2.3, 1);

    const count = deltaFor({ current: 40, previous: 20 });
    expect(count).toMatchObject({ kind: "move", up: true, unit: "percent" });
    expect(count.kind === "move" && count.magnitude).toBeCloseTo(100, 5);
  });

  it("ignores a move finer than one reply can express", () => {
    // At ~200 sends one reply is worth half a point, so anything under that
    // is the chip reacting to a single reader rather than to a change.
    expect(deltaFor({ current: 0.025, previous: 0.0262, unit: "percent" })).toEqual({
      kind: "flat",
    });
  });

  it("flips the colour, not the arrow, when growth is bad", () => {
    const worse = deltaFor({ current: 0.08, previous: 0.02, unit: "percent", invert: true });

    expect(worse).toMatchObject({ kind: "move", up: true, improving: false });
  });
});
