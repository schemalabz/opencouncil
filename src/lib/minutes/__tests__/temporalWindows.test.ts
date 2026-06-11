import { DiscussionStatus } from '@prisma/client';
import {
    computeTemporalWindows,
    assignUtterances,
    WindowUtterance,
} from '../temporalWindows';

function makeUtterance(overrides: {
    id?: string;
    startTimestamp: number;
    endTimestamp: number;
    discussionSubjectId?: string | null;
    discussionStatus?: DiscussionStatus | null;
    text?: string;
    personId?: string | null;
    label?: string | null;
}): WindowUtterance {
    return {
        id: overrides.id ?? `u-${overrides.startTimestamp}`,
        startTimestamp: overrides.startTimestamp,
        endTimestamp: overrides.endTimestamp,
        discussionSubjectId: overrides.discussionSubjectId ?? null,
        discussionStatus: overrides.discussionStatus ?? null,
        text: overrides.text ?? 'text',
        speakerSegment: {
            speakerTag: {
                personId: overrides.personId ?? 'person-1',
                label: overrides.label ?? 'Speaker',
            },
        },
    };
}

describe('computeTemporalWindows', () => {
    it('computes window from linked utterances', () => {
        const utterances = [
            makeUtterance({ startTimestamp: 10, endTimestamp: 15, discussionSubjectId: 's1', discussionStatus: 'SUBJECT_DISCUSSION' }),
            makeUtterance({ startTimestamp: 20, endTimestamp: 25, discussionSubjectId: 's1', discussionStatus: 'VOTE' }),
        ];

        const windows = computeTemporalWindows(utterances, ['s1']);

        expect(windows).toEqual([{ subjectId: 's1', start: 10, end: 25 }]);
    });

    it('excludes PROCEDURAL_VOTE from boundaries when non-procedural utterances exist', () => {
        const utterances = [
            makeUtterance({ startTimestamp: 5, endTimestamp: 8, discussionSubjectId: 's1', discussionStatus: 'PROCEDURAL_VOTE' }),
            makeUtterance({ startTimestamp: 20, endTimestamp: 25, discussionSubjectId: 's1', discussionStatus: 'SUBJECT_DISCUSSION' }),
            makeUtterance({ startTimestamp: 30, endTimestamp: 35, discussionSubjectId: 's1', discussionStatus: 'VOTE' }),
        ];

        const windows = computeTemporalWindows(utterances, ['s1']);

        expect(windows).toEqual([{ subjectId: 's1', start: 20, end: 35 }]);
    });

    it('falls back to PROCEDURAL_VOTE when no other utterances exist', () => {
        const utterances = [
            makeUtterance({ startTimestamp: 5, endTimestamp: 8, discussionSubjectId: 's1', discussionStatus: 'PROCEDURAL_VOTE' }),
            makeUtterance({ startTimestamp: 10, endTimestamp: 12, discussionSubjectId: 's1', discussionStatus: 'PROCEDURAL_VOTE' }),
        ];

        const windows = computeTemporalWindows(utterances, ['s1']);

        expect(windows).toEqual([{ subjectId: 's1', start: 5, end: 12 }]);
    });

    it('returns empty for subjects with no linked utterances', () => {
        const utterances = [
            makeUtterance({ startTimestamp: 10, endTimestamp: 15, discussionSubjectId: 's2' }),
        ];

        const windows = computeTemporalWindows(utterances, ['s1']);

        expect(windows).toEqual([]);
    });

    it('sorts windows by start timestamp', () => {
        const utterances = [
            makeUtterance({ startTimestamp: 30, endTimestamp: 40, discussionSubjectId: 's2', discussionStatus: 'SUBJECT_DISCUSSION' }),
            makeUtterance({ startTimestamp: 10, endTimestamp: 20, discussionSubjectId: 's1', discussionStatus: 'SUBJECT_DISCUSSION' }),
        ];

        const windows = computeTemporalWindows(utterances, ['s1', 's2']);

        expect(windows[0].subjectId).toBe('s1');
        expect(windows[1].subjectId).toBe('s2');
    });

    it('handles overlapping windows — both returned, sorted by start', () => {
        const utterances = [
            makeUtterance({ startTimestamp: 0, endTimestamp: 15, discussionSubjectId: 's1', discussionStatus: 'SUBJECT_DISCUSSION' }),
            makeUtterance({ startTimestamp: 10, endTimestamp: 25, discussionSubjectId: 's2', discussionStatus: 'SUBJECT_DISCUSSION' }),
        ];

        const windows = computeTemporalWindows(utterances, ['s1', 's2']);

        expect(windows).toHaveLength(2);
        expect(windows[0]).toEqual({ subjectId: 's1', start: 0, end: 15 });
        expect(windows[1]).toEqual({ subjectId: 's2', start: 10, end: 25 });
    });
});

describe('assignUtterances', () => {
    it('assigns utterances within a window to the owning subject', () => {
        const utterances = [
            makeUtterance({ id: 'u1', startTimestamp: 10, endTimestamp: 12, discussionSubjectId: 's1' }),
            makeUtterance({ id: 'u2', startTimestamp: 13, endTimestamp: 15, discussionSubjectId: null }),
            makeUtterance({ id: 'u3', startTimestamp: 18, endTimestamp: 20, discussionSubjectId: 's1' }),
        ];
        const windows = [{ subjectId: 's1', start: 10, end: 20 }];

        const result = assignUtterances(utterances, windows, ['s1']);

        expect(result.utterancesBySubject.get('s1')?.map(u => u.id)).toEqual(['u1', 'u2', 'u3']);
        expect(result.preambleUtterances).toHaveLength(0);
        expect(result.epilogueUtterances).toHaveLength(0);
    });

    it('assigns utterances before first window to preamble', () => {
        const utterances = [
            makeUtterance({ id: 'u1', startTimestamp: 2, endTimestamp: 4, discussionSubjectId: null }),
            makeUtterance({ id: 'u2', startTimestamp: 10, endTimestamp: 15, discussionSubjectId: 's1' }),
        ];
        const windows = [{ subjectId: 's1', start: 10, end: 15 }];

        const result = assignUtterances(utterances, windows, ['s1']);

        expect(result.preambleUtterances.map(u => u.id)).toEqual(['u1']);
        expect(result.utterancesBySubject.get('s1')?.map(u => u.id)).toEqual(['u2']);
    });

    it('assigns utterances after last window to epilogue', () => {
        const utterances = [
            makeUtterance({ id: 'u1', startTimestamp: 10, endTimestamp: 15, discussionSubjectId: 's1' }),
            makeUtterance({ id: 'u2', startTimestamp: 50, endTimestamp: 55, discussionSubjectId: null }),
        ];
        const windows = [{ subjectId: 's1', start: 10, end: 15 }];

        const result = assignUtterances(utterances, windows, ['s1']);

        expect(result.epilogueUtterances.map(u => u.id)).toEqual(['u2']);
    });

    it('assigns utterances between windows as pre-discussion for next subject', () => {
        const utterances = [
            makeUtterance({ id: 'u1', startTimestamp: 10, endTimestamp: 15, discussionSubjectId: 's1' }),
            makeUtterance({ id: 'u-between', startTimestamp: 20, endTimestamp: 22, discussionSubjectId: null }),
            makeUtterance({ id: 'u2', startTimestamp: 30, endTimestamp: 35, discussionSubjectId: 's2' }),
        ];
        const windows = [
            { subjectId: 's1', start: 10, end: 15 },
            { subjectId: 's2', start: 30, end: 35 },
        ];

        const result = assignUtterances(utterances, windows, ['s1', 's2']);

        expect(result.preDiscussionByIndex.get(1)?.map(u => u.id)).toEqual(['u-between']);
    });

    it('marks cross-subject utterances within a window', () => {
        const utterances = [
            makeUtterance({ id: 'u1', startTimestamp: 10, endTimestamp: 12, discussionSubjectId: 's1' }),
            makeUtterance({ id: 'u-cross', startTimestamp: 13, endTimestamp: 14, discussionSubjectId: 's2' }),
            makeUtterance({ id: 'u3', startTimestamp: 18, endTimestamp: 20, discussionSubjectId: 's1' }),
        ];
        const windows = [{ subjectId: 's1', start: 10, end: 20 }];

        const result = assignUtterances(utterances, windows, ['s1', 's2']);

        expect(result.utterancesBySubject.get('s1')?.map(u => u.id)).toEqual(['u1', 'u-cross', 'u3']);
        const crossMap = result.crossSubjectMap.get('s1');
        expect(crossMap?.get('u-cross')).toBe('s2');
    });

    it('earlier-starting window wins overlapping range', () => {
        const utterances = [
            makeUtterance({ id: 'u1', startTimestamp: 5, endTimestamp: 8, discussionSubjectId: 's1' }),
            makeUtterance({ id: 'u-overlap', startTimestamp: 12, endTimestamp: 14, discussionSubjectId: 's2' }),
            makeUtterance({ id: 'u3', startTimestamp: 18, endTimestamp: 22, discussionSubjectId: 's2' }),
        ];
        const windows = [
            { subjectId: 's1', start: 5, end: 15 },
            { subjectId: 's2', start: 10, end: 22 },
        ];

        const result = assignUtterances(utterances, windows, ['s1', 's2']);

        expect(result.utterancesBySubject.get('s1')?.map(u => u.id)).toContain('u-overlap');
        expect(result.crossSubjectMap.get('s1')?.get('u-overlap')).toBe('s2');
    });

    it('assigns all to preamble when no windows exist', () => {
        const utterances = [
            makeUtterance({ id: 'u1', startTimestamp: 5, endTimestamp: 10 }),
            makeUtterance({ id: 'u2', startTimestamp: 15, endTimestamp: 20 }),
        ];

        const result = assignUtterances(utterances, [], []);

        expect(result.preambleUtterances).toHaveLength(2);
    });

    it('handles single-utterance zero-width window', () => {
        const utterances = [
            makeUtterance({ id: 'u-before', startTimestamp: 5, endTimestamp: 8 }),
            makeUtterance({ id: 'u-subject', startTimestamp: 10, endTimestamp: 12, discussionSubjectId: 's1' }),
            makeUtterance({ id: 'u-after', startTimestamp: 15, endTimestamp: 18 }),
        ];
        const windows = [{ subjectId: 's1', start: 10, end: 12 }];

        const result = assignUtterances(utterances, windows, ['s1']);

        expect(result.preambleUtterances.map(u => u.id)).toEqual(['u-before']);
        expect(result.utterancesBySubject.get('s1')?.map(u => u.id)).toEqual(['u-subject']);
        expect(result.epilogueUtterances.map(u => u.id)).toEqual(['u-after']);
    });

});
