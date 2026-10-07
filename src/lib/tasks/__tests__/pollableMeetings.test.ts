import { partitionMeetingsForPolling, interleaveByCity, orderForPolling } from "../pollableMeetings";

describe("partitionMeetingsForPolling", () => {
    it("marks a meeting with unlinked eligible subjects as pollable, not complete", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1", kind: "regular", continuationOf: null, scheduleStatus: "scheduled" as const }],
            { m1: { linked: 1, eligible: 3 } },
        );
        expect(result.pollable).toHaveLength(1);
        expect(result.pollable[0].meetingId).toBe("m1");
        expect(result.pollable[0].alreadyComplete).toBe(false);
        expect(result.skipped).toHaveLength(0);
        expect(result.alreadyCompleteCount).toBe(0);
    });

    it("flags fully-linked meetings as pollable but alreadyComplete", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1", kind: "regular", continuationOf: null, scheduleStatus: "scheduled" as const }],
            { m1: { linked: 3, eligible: 3 } },
        );
        expect(result.pollable).toHaveLength(1);
        expect(result.pollable[0].alreadyComplete).toBe(true);
        expect(result.alreadyCompleteCount).toBe(1);
    });

    it("skips a postponed or cancelled meeting: it took no decisions on its date", () => {
        const result = partitionMeetingsForPolling(
            [
                { id: "m1", name: "Συνεδρίαση 1", kind: "regular", continuationOf: null, scheduleStatus: "cancelled" as const },
                { id: "m2", name: "Συνεδρίαση 2", kind: "regular", continuationOf: null, scheduleStatus: "postponed" as const },
            ],
            { m1: { linked: 0, eligible: 3 }, m2: { linked: 0, eligible: 3 } },
        );
        expect(result.pollable).toHaveLength(0);
        expect(result.skipped.map(m => m.skipReason)).toEqual(["notTakingPlace", "notTakingPlace"]);
    });

    it("skips meetings with no eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1", kind: "regular", continuationOf: null, scheduleStatus: "scheduled" as const }],
            { m1: { linked: 0, eligible: 0 } },
        );
        expect(result.pollable).toHaveLength(0);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].skipReason).toBe("noEligibleSubjects");
    });

    // A secondary body publishes no decisions (#829), whatever its subjects look like.
    it("skips the meetings of a secondary body even when they have eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [
                { id: "m1", name: "Συνεδρίαση 1", kind: "regular", continuationOf: null, scheduleStatus: "scheduled" as const, administrativeBody: { type: "youthCouncil" } },
                { id: "m2", name: "Συνεδρίαση 2", kind: "regular", continuationOf: null, scheduleStatus: "scheduled" as const, administrativeBody: { type: "committee" } },
                { id: "m3", name: "Συνεδρίαση 3", kind: "regular", continuationOf: null, scheduleStatus: "scheduled" as const, administrativeBody: null },
            ],
            { m1: { linked: 0, eligible: 2 }, m2: { linked: 0, eligible: 2 }, m3: { linked: 0, eligible: 2 } },
        );
        expect(result.skipped.map(m => [m.meetingId, m.skipReason])).toEqual([["m1", "secondaryBody"]]);
        expect(result.pollable.map(m => m.meetingId)).toEqual(["m2", "m3"]);
    });

    it("skips Λογοδοσία meetings even when they have eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Δημοτικό Συμβούλιο 25/06/2026", kind: "accountability", continuationOf: null, scheduleStatus: "scheduled" as const }],
            { m1: { linked: 0, eligible: 2 } },
        );
        expect(result.pollable).toHaveLength(0);
        expect(result.skipped[0].skipReason).toBe("noDecisions");
    });

    it("skips an απολογισμός meeting and a later part of one", () => {
        const result = partitionMeetingsForPolling(
            [
                { id: "m1", name: "Απολογισμός", kind: "activityReport", continuationOf: null, scheduleStatus: "scheduled" as const },
                { id: "m2", name: "Απολογισμός (συνέχεια)", kind: null, continuationOf: { kind: "activityReport" }, scheduleStatus: "scheduled" as const },
            ],
            { m1: { linked: 0, eligible: 2 }, m2: { linked: 0, eligible: 2 } },
        );
        expect(result.pollable).toHaveLength(0);
        expect(result.skipped.map((m) => m.skipReason)).toEqual(["noDecisions", "noDecisions"]);
    });

    it("polls a meeting of unknown kind, whatever its name says", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Λογοδοσία και Δημοτικό Συμβούλιο 04/02/26", kind: null, continuationOf: null, scheduleStatus: "scheduled" as const }],
            { m1: { linked: 0, eligible: 2 } },
        );
        expect(result.pollable).toHaveLength(1);
        expect(result.skipped).toHaveLength(0);
    });

    it("treats a meeting missing from decisionCounts as having no eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1", kind: "regular", continuationOf: null, scheduleStatus: "scheduled" as const }],
            {},
        );
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].skipReason).toBe("noEligibleSubjects");
    });
});

describe("interleaveByCity", () => {
    const m = (cityId: string, id: string) => ({ cityId, id });

    it("round-robins across cities, preserving per-city order", () => {
        const result = interleaveByCity([
            m("a", "a1"), m("a", "a2"), m("a", "a3"),
            m("b", "b1"), m("b", "b2"),
            m("c", "c1"),
        ]);
        expect(result.map(x => x.id)).toEqual(["a1", "b1", "c1", "a2", "b2", "a3"]);
    });

    it("keeps a single-city list unchanged", () => {
        const result = interleaveByCity([m("a", "a1"), m("a", "a2")]);
        expect(result.map(x => x.id)).toEqual(["a1", "a2"]);
    });

    it("handles an empty list", () => {
        expect(interleaveByCity([])).toEqual([]);
    });

    it("starts city order from the first appearance in the input", () => {
        // Input is newest-first: city b has the newest meeting, so b leads.
        const result = interleaveByCity([m("b", "b1"), m("a", "a1"), m("b", "b2")]);
        expect(result.map(x => x.id)).toEqual(["b1", "a1", "b2"]);
    });
});

describe("orderForPolling", () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
    // A meeting first polled `first` days ago and last attempted `last` days ago.
    const m = (cityId: string, id: string, first: number | null, last: number | null) => ({
        cityId, id,
        firstPollAt: first === null ? null : daysAgo(first),
        lastAttemptAt: last === null ? null : daysAgo(last),
    });

    it("puts never-attempted meetings first, then the most overdue", () => {
        // Input is newest-first, as the cron query returns it.
        const result = orderForPolling([
            m("a", "a-recent", 2, 0.5),
            m("a", "a-new", null, null),
            m("a", "a-stale", 3, 3),
        ]);
        expect(result.map(x => x.id)).toEqual(["a-new", "a-stale", "a-recent"]);
    });

    it("ranks a week-one meeting ahead of a weekly-tier one polled less recently", () => {
        // Week one is due every run, so 3 days since its last poll is 3 days
        // overdue; a week-four meeting polled 8 days ago is only 1 day overdue.
        const result = orderForPolling([
            m("a", "weekly", 40, 8),
            m("b", "week-one", 4, 3),
        ]);
        expect(result.map(x => x.id)).toEqual(["week-one", "weekly"]);
    });

    it("keeps newest-first among meetings due at the same time", () => {
        const result = orderForPolling([m("a", "a1", null, null), m("a", "a2", null, null)]);
        expect(result.map(x => x.id)).toEqual(["a1", "a2"]);
    });

    it("reaches a city whose meetings have waited longest", () => {
        // Newest-first would lead with city a's just-polled meetings on every
        // run, and city b would never make a capped batch.
        const result = orderForPolling([
            m("a", "a1", 2, 0.5),
            m("a", "a2", 2, 0.5),
            m("b", "b1", 5, 5),
        ]);
        expect(result[0].id).toBe("b1");
    });

    it("counts a failed-only attempt, so a failing meeting does not lead every batch", () => {
        // Never succeeded (no firstPollAt) but attempted an hour ago.
        const result = orderForPolling([m("a", "failing", null, 0.04), m("b", "stale", 3, 3)]);
        expect(result.map(x => x.id)).toEqual(["stale", "failing"]);
    });
});
