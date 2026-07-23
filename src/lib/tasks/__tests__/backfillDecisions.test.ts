import { selectBackfillMeetings, BackfillCandidate } from "../backfillDecisionsSelection";

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** Base candidate: eligible, unlinked, never polled, not in progress → dispatches. */
function candidate(overrides: Partial<BackfillCandidate> = {}): BackfillCandidate {
    return {
        cityId: "athens",
        meetingId: "m1",
        meetingName: "Δημοτικό Συμβούλιο",
        dateTime: daysAgo(400),
        eligibleSubjectCount: 5,
        linkedDecisionCount: 0,
        lastSucceededPollAt: null,
        hasInProgressPoll: false,
        ...overrides,
    };
}

describe("selectBackfillMeetings", () => {
    const opts = { skipRecentDays: 7 };

    it("dispatches an eligible, unlinked, never-polled meeting", () => {
        const [d] = selectBackfillMeetings([candidate()], opts);
        expect(d.dispatch).toBe(true);
        expect(d.skipReason).toBeUndefined();
    });

    it("skips a meeting with no eligible subjects", () => {
        const [d] = selectBackfillMeetings([candidate({ eligibleSubjectCount: 0 })], opts);
        expect(d.dispatch).toBe(false);
        expect(d.skipReason).toBe("no eligible subjects");
    });

    it("skips a meeting where all eligible subjects are already linked", () => {
        const [d] = selectBackfillMeetings(
            [candidate({ eligibleSubjectCount: 3, linkedDecisionCount: 3 })],
            opts,
        );
        expect(d.dispatch).toBe(false);
        expect(d.skipReason).toBe("all eligible subjects already linked");
    });

    it("dispatches when some but not all subjects are linked", () => {
        const [d] = selectBackfillMeetings(
            [candidate({ eligibleSubjectCount: 5, linkedDecisionCount: 2 })],
            opts,
        );
        expect(d.dispatch).toBe(true);
    });

    it("skips Λογοδοσία meetings (incl. combined names)", () => {
        const [a] = selectBackfillMeetings([candidate({ meetingName: "Λογοδοσία" })], opts);
        const [b] = selectBackfillMeetings(
            [candidate({ meetingName: "Λογοδοσίας Δημάρχου" })],
            opts,
        );
        const [c] = selectBackfillMeetings(
            [candidate({ meetingName: "Λογοδοσία και Δημοτικό Συμβούλιο" })],
            opts,
        );
        expect(a.skipReason).toBe("Λογοδοσία meeting");
        expect(b.skipReason).toBe("Λογοδοσία meeting");
        expect(c.skipReason).toBe("Λογοδοσία meeting");
    });

    it("skips a meeting with an in-progress poll", () => {
        const [d] = selectBackfillMeetings([candidate({ hasInProgressPoll: true })], opts);
        expect(d.dispatch).toBe(false);
        expect(d.skipReason).toBe("poll already in progress");
    });

    it("skips a meeting polled within the skip-recent window", () => {
        const [d] = selectBackfillMeetings(
            [candidate({ lastSucceededPollAt: daysAgo(2) })],
            opts,
        );
        expect(d.dispatch).toBe(false);
        expect(d.skipReason).toContain("skip-recent window");
    });

    it("dispatches a meeting last polled before the skip-recent window", () => {
        const [d] = selectBackfillMeetings(
            [candidate({ lastSucceededPollAt: daysAgo(30) })],
            opts,
        );
        expect(d.dispatch).toBe(true);
    });

    it("orders decisions oldest-first", () => {
        const decisions = selectBackfillMeetings(
            [
                candidate({ meetingId: "newest", dateTime: daysAgo(10) }),
                candidate({ meetingId: "oldest", dateTime: daysAgo(800) }),
                candidate({ meetingId: "middle", dateTime: daysAgo(200) }),
            ],
            opts,
        );
        expect(decisions.map((d) => d.candidate.meetingId)).toEqual([
            "oldest",
            "middle",
            "newest",
        ]);
    });

    it("applies skip-reason precedence: no-subjects before all-linked before Λογοδοσία", () => {
        // eligibleSubjectCount === 0 wins even if name is Λογοδοσία
        const [d] = selectBackfillMeetings(
            [candidate({ eligibleSubjectCount: 0, meetingName: "Λογοδοσία" })],
            opts,
        );
        expect(d.skipReason).toBe("no eligible subjects");
    });

    it("respects an injected clock for the skip-recent check", () => {
        const now = new Date("2026-06-15T00:00:00Z");
        const polledFiveDaysBefore = new Date("2026-06-10T00:00:00Z");
        const [d] = selectBackfillMeetings(
            [candidate({ lastSucceededPollAt: polledFiveDaysBefore })],
            { skipRecentDays: 7, now },
        );
        expect(d.dispatch).toBe(false);
        expect(d.skipReason).toContain("skip-recent window");
    });
});
