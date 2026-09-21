import { fmtPct, fmtTimeAgo } from "../format";
import {
  deltaFor,
  fillSeries,
  listBuckets,
  parseRange,
  pctChange,
  pointsChange,
  replierRate,
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
        repliers: [],
        recipients: [],
        errors: [{ key: "2026-08-16", count: 2 }],
      },
    );
    expect(series.map((p) => p.sent)).toEqual([0, 3, 0]);
    expect(series.map((p) => p.received)).toEqual([0, 0, 0]);
    expect(series.find((p) => p.key === "2026-08-15")?.activeUsers).toBe(1);
    expect(series.map((p) => p.errors)).toEqual([0, 0, 2]);
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

describe("replierRate", () => {
  it("counts a reader once, however many times they wrote", () => {
    // The whole reason this replaced a per-message rate: five replies from
    // one enthusiast and five from five people are opposite answers to
    // "is this worth reading", and a message-level rate cannot tell them
    // apart.
    expect(replierRate(12, 102)).toBeCloseTo(0.1176, 4);
    expect(replierRate(0, 102)).toBe(0);
  });

  it("divides by the readers written to, not by the whole list", () => {
    // Νότης is quiet by design, so most of the list has nothing to reply to
    // in any given period. Against 513 subscribers, 52 repliers reads as
    // 10%; against the 300 he actually wrote to, it is 17%. The second
    // number is the one that answers "was this worth reading".
    expect(replierRate(52, 300)).toBeCloseTo(0.173, 3);
    expect(replierRate(52, 513)).toBeCloseTo(0.101, 3);
  });

  it("has no rate when he wrote to nobody", () => {
    expect(replierRate(0, 0)).toBeNull();
    // Not a zero: nobody failed to answer a message that was never sent.
    expect(replierRate(3, 0)).toBeNull();
  });

  it("cannot exceed 100%, however narrow the bucket", () => {
    // A chart bucket is one minute wide. Two readers answering in the minute
    // Νότης wrote to one is 200% — not a rate, and it drags the chart's
    // scale with it, flattening every honest bucket onto the floor.
    expect(replierRate(2, 1)).toBe(1);
    expect(replierRate(1, 1)).toBe(1);
  });
});

describe("deltaFor, on a rate that can be absent", () => {
  it("says nothing when the current period has no rate", () => {
    // «νέο» means the PREVIOUS period had no baseline, so it says the
    // opposite of what happened. The headline reads «—»; so does the chip.
    expect(deltaFor({ current: null, previous: 0.17, unit: "percent" })).toEqual({
      kind: "none",
    });
  });
});

describe("deltaFor", () => {
  it("calls an absent baseline new, never a rise from zero", () => {
    // replierRate() returns null when nothing went out. Reading that as 0%
    // turns the first period after a recess into a confident green rise.
    expect(deltaFor({ current: 0.0249, previous: null, unit: "percent" })).toEqual({ kind: "new" });
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
