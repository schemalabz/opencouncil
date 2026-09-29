import { partitionMeetingsForPolling, interleaveByCity, orderForPolling } from "../pollableMeetings";

describe("partitionMeetingsForPolling", () => {
    it("marks a meeting with unlinked eligible subjects as pollable, not complete", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1" }],
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
            [{ id: "m1", name: "Συνεδρίαση 1" }],
            { m1: { linked: 3, eligible: 3 } },
        );
        expect(result.pollable).toHaveLength(1);
        expect(result.pollable[0].alreadyComplete).toBe(true);
        expect(result.alreadyCompleteCount).toBe(1);
    });

    it("skips meetings with no eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1" }],
            { m1: { linked: 0, eligible: 0 } },
        );
        expect(result.pollable).toHaveLength(0);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].skipReason).toBe("noEligibleSubjects");
    });

    it("skips Λογοδοσία meetings even when they have eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Λογοδοσία Δημάρχου" }],
            { m1: { linked: 0, eligible: 2 } },
        );
        expect(result.pollable).toHaveLength(0);
        expect(result.skipped[0].skipReason).toBe("logodosia");
    });

    it("treats a meeting missing from decisionCounts as having no eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1" }],
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
