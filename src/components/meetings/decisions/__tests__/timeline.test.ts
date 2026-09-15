import { buildTimeline, subjectHasGaps, hasDiscussionOrder, positionsById, matchesStatusFilter, voteResultSentence } from '../timeline';
import type { MinutesSubject, MinutesProceduralVote, MinutesAttendanceChange } from '@/lib/minutes/types';
import type { MinutesVoteResult, MinutesMember } from '@/lib/minutes/types';

const neutralVote: MinutesVoteResult = {
    forMembers: [],
    againstMembers: [],
    abstainMembers: [],
    presentMembers: [],
    didNotVoteMembers: [],
    absentMembers: [],
    passed: true,
    isUnanimous: true,
};

const member: MinutesMember = { personId: 'p', name: 'n', party: null, isPartyHead: false, role: null };
const members = (n: number): MinutesMember[] => Array.from({ length: n }, () => member);

function subject(o: Partial<MinutesSubject> & { subjectId: string }): MinutesSubject {
    return {
        agendaItemIndex: 1,
        nonAgendaReason: null,
        withdrawn: false,
        name: o.subjectId,
        discussedWith: null,
        discussedElsewhere: null,
        decision: null,
        attendance: { present: [], absent: [] },
        voteResult: null,
        preDiscussionEntries: [],
        transcriptEntries: [],
        discussion: { kind: 'discussed', seconds: 60, start: 100 },
        ...o,
    };
}

const at = (id: string): MinutesAttendanceChange['atSubject'] => ({ id, name: id, agendaItemIndex: null, nonAgendaReason: null, outOfAgendaIndex: null });

describe('buildTimeline', () => {
    it('numbers the non-withdrawn subjects 1-based in the order given', () => {
        const { items, positionById } = buildTimeline({
            subjects: [
                subject({ subjectId: 'a', discussion: { kind: 'discussed', seconds: 10, start: 100 } }),
                subject({ subjectId: 'w', withdrawn: true, discussion: { kind: 'none', seconds: 0, start: null } }),
                subject({ subjectId: 'b', discussion: { kind: 'voteOnly', seconds: 0, start: 200 } }),
            ],
            attendanceChanges: [],
            proceduralVotes: [],
        });
        expect(items.map(i => i.type === 'subject' ? `${i.subjectId}:${i.position}` : i.type)).toEqual(['a:1', 'b:2']);
        expect(positionById).toEqual(new Map([['a', 1], ['b', 2]]));
    });

    it('parks withdrawn subjects under notDiscussed without a position', () => {
        const { notDiscussed, items } = buildTimeline({
            subjects: [
                subject({ subjectId: 'a', discussion: { kind: 'discussed', seconds: 10, start: 100 } }),
                subject({ subjectId: 'w', withdrawn: true, discussion: { kind: 'none', seconds: 0, start: null } }),
                subject({ subjectId: 'b', discussion: { kind: 'voteOnly', seconds: 0, start: 200 } }),
            ],
            attendanceChanges: [],
            proceduralVotes: [],
        });
        expect(notDiscussed.map(s => s.subjectId)).toEqual(['w']);
        expect(items.filter(i => i.type === 'subject' && i.subjectId === 'w')).toEqual([]);
    });

    it('groups attendance changes into one event before the subject they precede', () => {
        const { items } = buildTimeline({
            subjects: [subject({ subjectId: 'a' }), subject({ subjectId: 'b', discussion: { kind: 'discussed', seconds: 5, start: 500 } })],
            attendanceChanges: [
                { personId: 'p1', name: 'Α', type: 'arrival', atSubject: at('b') },
                { personId: 'p2', name: 'Β', type: 'departure', atSubject: at('b') },
                { personId: 'p3', name: 'Γ', type: 'departure', atSubject: at('b') },
            ],
            proceduralVotes: [],
        });
        expect(items.map(i => i.type)).toEqual(['subject', 'attendance', 'subject']);
        expect(items[1]).toEqual({ type: 'attendance', atSubjectId: 'b', arrivals: ['Α'], departures: ['Β', 'Γ'] });
    });

    it('places a procedural vote before the first subject that starts after it', () => {
        const vote: MinutesProceduralVote = { subjectId: 'oa', name: 'ΕΗΔ', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda', kind: 'urgency', timestamp: 50 };
        const { items } = buildTimeline({
            subjects: [
                subject({ subjectId: 'a', discussion: { kind: 'discussed', seconds: 10, start: 100 } }),
                subject({ subjectId: 'oa', nonAgendaReason: 'outOfAgenda', agendaItemIndex: null, discussion: { kind: 'discussed', seconds: 10, start: 300 } }),
            ],
            attendanceChanges: [],
            proceduralVotes: [vote],
        });
        expect(items.map(i => i.type)).toEqual(['proceduralVote', 'subject', 'subject']);
    });

    it('places a procedural vote after the last placed subject when it is later than all of them', () => {
        const vote: MinutesProceduralVote = { subjectId: 'w', name: 'W', agendaItemIndex: 5, nonAgendaReason: null, kind: 'procedural', timestamp: 900 };
        const { items } = buildTimeline({
            subjects: [subject({ subjectId: 'a', discussion: { kind: 'discussed', seconds: 10, start: 100 } })],
            attendanceChanges: [],
            proceduralVotes: [vote],
        });
        expect(items.map(i => i.type)).toEqual(['subject', 'proceduralVote']);
    });

    it('keeps a subject with no start at its given position', () => {
        const { items } = buildTimeline({
            subjects: [
                subject({ subjectId: 'a', discussion: { kind: 'discussed', seconds: 10, start: 100 } }),
                subject({ subjectId: 'x', discussion: { kind: 'none', seconds: 0, start: null } }),
                subject({ subjectId: 'b', discussion: { kind: 'discussed', seconds: 10, start: 200 } }),
            ],
            attendanceChanges: [],
            proceduralVotes: [],
        });
        expect(items.map(i => i.type === 'subject' ? i.subjectId : i.type)).toEqual(['a', 'x', 'b']);
    });

    it('never attaches an event to a subject with no start', () => {
        const { items } = buildTimeline({
            subjects: [
                subject({ subjectId: 'a', discussion: { kind: 'discussed', seconds: 10, start: 100 } }),
                subject({ subjectId: 'x', discussion: { kind: 'none', seconds: 0, start: null } }),
                subject({ subjectId: 'b', discussion: { kind: 'discussed', seconds: 10, start: 200 } }),
            ],
            attendanceChanges: [],
            proceduralVotes: [{ subjectId: 'b', name: 'b', agendaItemIndex: 2, nonAgendaReason: null, kind: 'procedural', timestamp: 150 }],
        });
        // The vote at 150 lands before 'b' (start 200); 'x' has no start and never attracts an event.
        expect(items.map(i => i.type === 'subject' ? i.subjectId : i.type)).toEqual(['a', 'x', 'proceduralVote', 'b']);
    });

    it('drains several votes due before the same subject in time order', () => {
        const { items } = buildTimeline({
            subjects: [
                subject({ subjectId: 's', discussion: { kind: 'discussed', seconds: 10, start: 100 } }),
            ],
            attendanceChanges: [],
            proceduralVotes: [
                { subjectId: 's', name: 'vote1', agendaItemIndex: null, nonAgendaReason: null, kind: 'procedural', timestamp: 20 },
                { subjectId: 's', name: 'vote2', agendaItemIndex: null, nonAgendaReason: null, kind: 'procedural', timestamp: 30 },
            ],
        });
        const votes = items.filter(i => i.type === 'proceduralVote');
        expect(votes).toHaveLength(2);
        expect(votes[0].vote.timestamp).toBe(20);
        expect(votes[1].vote.timestamp).toBe(30);
        expect(items.map(i => i.type)).toEqual(['proceduralVote', 'proceduralVote', 'subject']);
    });

    it('treats a vote at the same timestamp as a subject start as not before it', () => {
        const { items } = buildTimeline({
            subjects: [
                subject({ subjectId: 'a', discussion: { kind: 'discussed', seconds: 10, start: 100 } }),
                subject({ subjectId: 'b', discussion: { kind: 'discussed', seconds: 10, start: 200 } }),
            ],
            attendanceChanges: [],
            proceduralVotes: [
                { subjectId: 'a', name: 'vote', agendaItemIndex: 1, nonAgendaReason: null, kind: 'procedural', timestamp: 100 },
            ],
        });
        expect(items.map(i => i.type === 'subject' ? i.subjectId : i.type)).toEqual(['a', 'proceduralVote', 'b']);
    });
});

describe('subjectHasGaps', () => {
    it('flags a subject with no utterances linked', () => {
        expect(subjectHasGaps(subject({ subjectId: 'a', discussion: { kind: 'none', seconds: 0, start: null }, voteResult: neutralVote }))).toBe(true);
    });

    it('flags a subject with no attendance', () => {
        expect(subjectHasGaps(subject({ subjectId: 'a', attendance: null, voteResult: neutralVote }))).toBe(true);
    });

    it('flags a subject with no vote', () => {
        expect(subjectHasGaps(subject({ subjectId: 'a', voteResult: null }))).toBe(true);
    });

    it('does not flag a vote-only subject with attendance and a vote', () => {
        expect(subjectHasGaps(subject({ subjectId: 'a', discussion: { kind: 'voteOnly', seconds: 0, start: 10 }, voteResult: neutralVote }))).toBe(false);
    });

    it('does not flag a subject with other linked utterances', () => {
        expect(subjectHasGaps(subject({ subjectId: 'a', discussion: { kind: 'other', seconds: 0, start: 10 }, voteResult: neutralVote }))).toBe(false);
    });

    it('never flags a withdrawn subject', () => {
        expect(subjectHasGaps(subject({ subjectId: 'a', withdrawn: true, attendance: null, voteResult: null, discussion: { kind: 'none', seconds: 0, start: null } }))).toBe(false);
    });
});

describe('hasDiscussionOrder', () => {
    it('is true when a subject has a start', () => {
        expect(hasDiscussionOrder({ subjects: [subject({ subjectId: 'a', discussion: { kind: 'discussed', seconds: 10, start: 100 } })] })).toBe(true);
    });

    it('is false when no subject has a start', () => {
        expect(hasDiscussionOrder({
            subjects: [
                subject({ subjectId: 'a', discussion: { kind: 'none', seconds: 0, start: null } }),
                subject({ subjectId: 'b', discussion: { kind: 'none', seconds: 0, start: null } }),
            ],
        })).toBe(false);
    });

    it('is false for an empty subject list', () => {
        expect(hasDiscussionOrder({ subjects: [] })).toBe(false);
    });
});

describe('positionsById', () => {
    it('skips withdrawn subjects and numbers the rest 1-based in order', () => {
        const map = positionsById({
            subjects: [
                subject({ subjectId: 'a' }),
                subject({ subjectId: 'w', withdrawn: true }),
                subject({ subjectId: 'b' }),
            ],
        });
        expect(map).toEqual(new Map([['a', 1], ['b', 2]]));
    });

    it('matches buildTimeline\'s own positionById', () => {
        const data = {
            subjects: [
                subject({ subjectId: 'a' }),
                subject({ subjectId: 'w', withdrawn: true }),
                subject({ subjectId: 'b' }),
            ],
            attendanceChanges: [],
            proceduralVotes: [],
        };
        expect(buildTimeline(data).positionById).toEqual(positionsById(data));
    });
});

describe('matchesStatusFilter', () => {
    const gapSubject = subject({ subjectId: 'g', discussion: { kind: 'none', seconds: 0, start: null }, voteResult: neutralVote });
    const cleanSubject = subject({ subjectId: 'c', discussion: { kind: 'voteOnly', seconds: 0, start: 10 }, voteResult: neutralVote });

    it('matches everything when the filter is empty', () => {
        expect(matchesStatusFilter([], false, undefined)).toBe(true);
    });

    it('matches a linked subject on "linked"', () => {
        expect(matchesStatusFilter(['linked'], true, cleanSubject)).toBe(true);
        expect(matchesStatusFilter(['linked'], false, cleanSubject)).toBe(false);
    });

    it('matches an unlinked subject on "none"', () => {
        expect(matchesStatusFilter(['none'], false, cleanSubject)).toBe(true);
        expect(matchesStatusFilter(['none'], true, cleanSubject)).toBe(false);
    });

    it('matches a subject with gaps on "gaps"', () => {
        expect(matchesStatusFilter(['gaps'], false, gapSubject)).toBe(true);
        expect(matchesStatusFilter(['gaps'], false, cleanSubject)).toBe(false);
    });

    it('does not match "gaps" when there is no minutes data for the subject', () => {
        expect(matchesStatusFilter(['gaps'], false, undefined)).toBe(false);
    });

    it('ORs several values together', () => {
        expect(matchesStatusFilter(['linked', 'gaps'], true, cleanSubject)).toBe(true);
        expect(matchesStatusFilter(['linked', 'gaps'], false, gapSubject)).toBe(true);
        expect(matchesStatusFilter(['linked', 'gaps'], false, cleanSubject)).toBe(false);
    });
});

describe('voteResultSentence', () => {
    const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key);

    it('is the unanimous sentence when isUnanimous', () => {
        const vote: MinutesVoteResult = { ...neutralVote, isUnanimous: true, passed: true, forMembers: members(5) };
        expect(voteResultSentence(t, vote)).toBe('unanimous{"count":5}');
    });

    it('is the majority sentence when passed and not unanimous', () => {
        const vote: MinutesVoteResult = { ...neutralVote, isUnanimous: false, passed: true, forMembers: members(3), againstMembers: members(1) };
        expect(voteResultSentence(t, vote)).toBe('majorityVote{"for":3,"against":1}');
    });

    it('is the rejected sentence when not passed', () => {
        const vote: MinutesVoteResult = { ...neutralVote, isUnanimous: false, passed: false, forMembers: members(1), againstMembers: members(3) };
        expect(voteResultSentence(t, vote)).toBe('rejected{"against":3,"for":1}');
    });

    it('appends the abstain count when not unanimous and there are abstainers', () => {
        const vote: MinutesVoteResult = { ...neutralVote, isUnanimous: false, passed: true, forMembers: members(2), againstMembers: [], abstainMembers: members(2) };
        expect(voteResultSentence(t, vote)).toBe('majorityVote{"for":2,"against":0}, 2 voteAbstain');
    });
});
