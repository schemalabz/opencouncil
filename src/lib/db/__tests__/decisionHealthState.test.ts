import { cityState } from '../decisionHealthState';

const base = {
    inScope: true, failedMeetings: 0, unplacedCandidates: 0, unplacedUnread: 0, conflicts: 0,
    polledMeetings: 5, meetings: 5,
};

describe('cityState', () => {
    it('reports cities outside the Diavgeia realm as out of scope, never as failing', () => {
        expect(cityState({ ...base, inScope: false, polledMeetings: 0, meetings: 10, failedMeetings: 2 })).toBe('outOfScope');
    });

    it('puts a meeting stuck in a failed poll ahead of triage work', () => {
        expect(cityState({ ...base, failedMeetings: 2, unplacedCandidates: 9 })).toBe('blocked');
    });

    it('reports work waiting for a human before drain progress', () => {
        expect(cityState({ ...base, unplacedCandidates: 3, polledMeetings: 1 })).toBe('needsTriage');
        expect(cityState({ ...base, conflicts: 1 })).toBe('needsTriage');
    });

    it('never demands triage for unread backfill rows alone', () => {
        expect(cityState({ ...base, unplacedCandidates: 4, unplacedUnread: 4 })).toBe('drained');
        expect(cityState({ ...base, unplacedCandidates: 4, unplacedUnread: 3 })).toBe('needsTriage');
    });

    it('separates a city never polled from one part-way through', () => {
        expect(cityState({ ...base, polledMeetings: 0, meetings: 10 })).toBe('notStarted');
        expect(cityState({ ...base, polledMeetings: 4, meetings: 10 })).toBe('draining');
    });

    it('calls a city drained when polling is complete, even with subjects unlinked', () => {
        expect(cityState(base)).toBe('drained');
    });
});
