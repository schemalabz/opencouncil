import { computeSubscriptionStats, weekStart, type SubscriptionRow } from "@/lib/subscription-stats";

// A Wednesday. The current week starts Monday 2026-09-07.
const NOW = new Date("2026-09-09T12:00:00Z");
const at = (iso: string) => new Date(iso);

const sub = (
  userId: string,
  createdAt: string,
  unsubscribedAt: string | null = null,
): SubscriptionRow => ({
  userId,
  status: unsubscribedAt ? "unsubscribed" : "active",
  createdAt: at(createdAt),
  unsubscribedAt: unsubscribedAt ? at(unsubscribedAt) : null,
});

describe("weekStart", () => {
  it("is the Monday of the week, in UTC, for any day of it", () => {
    expect(weekStart(at("2026-09-09T12:00:00Z")).toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(weekStart(at("2026-09-07T00:00:00Z")).toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(weekStart(at("2026-09-13T23:59:59Z")).toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(weekStart(at("2026-09-14T00:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});

describe("computeSubscriptionStats", () => {
  const subs = [
    sub("a", "2026-06-01T10:00:00Z"), // long active
    sub("b", "2026-08-25T10:00:00Z", "2026-09-08T09:00:00Z"), // stopped this week
    sub("c", "2026-09-08T10:00:00Z"), // started this week
    sub("d", "2026-08-31T10:00:00Z"), // started last week
  ];
  const targets = [
    { userId: "a", cityId: "athens" },
    { userId: "a", cityId: "chania" },
    { userId: "b", cityId: "athens" },
    { userId: "c", cityId: "athens" },
    { userId: "d", cityId: "chania" },
  ];

  it("counts active people, and active readers per municipality (a person in two counts in both)", () => {
    const stats = computeSubscriptionStats(subs, targets, NOW);
    expect(stats.active).toBe(3);
    expect(stats.cities.sort((x, y) => x.cityId.localeCompare(y.cityId))).toEqual([
      { cityId: "athens", active: 2 },
      { cityId: "chania", active: 2 },
    ]);
  });

  it("builds twelve Monday weeks ending on the current one, with the active count at each week's end", () => {
    const { weeks } = computeSubscriptionStats(subs, targets, NOW);
    expect(weeks).toHaveLength(12);
    expect(weeks[0].start).toBe("2026-06-22");
    expect(weeks[11].start).toBe("2026-09-07");
    // Last week: a, b, d active at its end (c not yet; b stops only this week).
    expect(weeks[10]).toEqual({ start: "2026-08-31", fresh: 1, stopped: 0, active: 3 });
    // This week: c starts, b stops → a, c, d.
    expect(weeks[11]).toEqual({ start: "2026-09-07", fresh: 1, stopped: 1, active: 3 });
    // Before anyone but a existed.
    expect(weeks[0].active).toBe(1);
  });

  it("windows the last 7 days and the 7 before them on the clock, not on weeks", () => {
    const stats = computeSubscriptionStats(subs, targets, NOW);
    expect(stats.newLast7Days).toBe(1); // c (d is 9 days old)
    expect(stats.newPrev7Days).toBe(1); // d
    expect(stats.stoppedLast7Days).toBe(1); // b
  });

  it("is all zeros on an empty service", () => {
    const stats = computeSubscriptionStats([], [], NOW);
    expect(stats.active).toBe(0);
    expect(stats.cities).toEqual([]);
    expect(stats.weeks.every((w) => w.active === 0 && w.fresh === 0 && w.stopped === 0)).toBe(true);
  });
});
