import { DiscussionStatus } from '@prisma/client';
import {
    computeTemporalWindows,
    assignUtterances,
    discussionSpans,
    WindowUtterance,
} from '../temporalWindows';
import { discussionOrderKeys, minutesSections, orderedMinutesSubjects } from '../builders';
import spartaMay6 from './fixtures/sparta-may6-2026-utterances.json';

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
    it('gives a later window of a subject the utterances inside it, over an earlier-starting window', () => {
        // Athens jul29_2_2026: item 25 is voted, «26.» is read (a VOTE of item
        // 26), and item 25 is taken up again: «Όχι, ένα λεπτό στο 25…».
        const utterances = [
            makeUtterance({ id: 'a1', startTimestamp: 10, endTimestamp: 12, discussionSubjectId: 's25', discussionStatus: 'SUBJECT_DISCUSSION' }),
            makeUtterance({ id: 'a2', startTimestamp: 13, endTimestamp: 14, discussionSubjectId: 's25', discussionStatus: 'VOTE' }),
            makeUtterance({ id: 'b1', startTimestamp: 15, endTimestamp: 16, discussionSubjectId: 's26', discussionStatus: 'VOTE' }),
            makeUtterance({ id: 'a3', startTimestamp: 17, endTimestamp: 18, discussionSubjectId: 's25', discussionStatus: 'SUBJECT_DISCUSSION' }),
            makeUtterance({ id: 'x', startTimestamp: 19, endTimestamp: 20, discussionSubjectId: null }),
            makeUtterance({ id: 'a4', startTimestamp: 21, endTimestamp: 22, discussionSubjectId: 's25', discussionStatus: 'SUBJECT_DISCUSSION' }),
            makeUtterance({ id: 'b2', startTimestamp: 30, endTimestamp: 35, discussionSubjectId: 's26', discussionStatus: 'VOTE' }),
        ];
        const windows = computeTemporalWindows(utterances, ['s25', 's26']);

        const result = assignUtterances(utterances, windows, ['s25', 's26']);

        expect(windows).toEqual([
            { subjectId: 's25', start: 10, end: 14 },
            { subjectId: 's26', start: 15, end: 35 },
            { subjectId: 's25', start: 17, end: 22 },
        ]);
        expect(result.utterancesBySubject.get('s25')?.map(u => u.id)).toEqual(['a1', 'a2', 'a3', 'x', 'a4']);
        expect(result.utterancesBySubject.get('s26')?.map(u => u.id)).toEqual(['b1', 'b2']);
        expect([...result.resumedAt]).toEqual(['a3']);
    });

    it('puts an untagged utterance before a resumed window in that subject, and one before a first window before the subject next in time', () => {
        const utterances = [
            makeUtterance({ id: 'a1', startTimestamp: 10, endTimestamp: 12, discussionSubjectId: 's1', discussionStatus: 'SUBJECT_DISCUSSION' }),
            makeUtterance({ id: 'gap1', startTimestamp: 13, endTimestamp: 14 }),
            makeUtterance({ id: 'b1', startTimestamp: 20, endTimestamp: 22, discussionSubjectId: 's2', discussionStatus: 'VOTE' }),
            makeUtterance({ id: 'gap2', startTimestamp: 25, endTimestamp: 26 }),
            makeUtterance({ id: 'a2', startTimestamp: 30, endTimestamp: 32, discussionSubjectId: 's1', discussionStatus: 'VOTE' }),
        ];
        const windows = computeTemporalWindows(utterances, ['s1', 's2']);
        // s1 is printed after s2: it was resumed and voted after s2.
        const result = assignUtterances(utterances, windows, ['s2', 's1']);

        expect(result.preDiscussionByIndex.get(0)?.map(u => u.id)).toEqual(['gap1']);
        expect(result.utterancesBySubject.get('s1')?.map(u => u.id)).toEqual(['a1', 'gap2', 'a2']);
        expect([...result.resumedAt]).toEqual(['gap2']);
    });
});

describe('discussionSpans', () => {
    const u = (id: string | null, status: DiscussionStatus | null, start: number) =>
        makeUtterance({ startTimestamp: start, endTimestamp: start + 1, discussionSubjectId: id, discussionStatus: status });

    it('splits a subject where another subject is voted between two of its utterances', () => {
        const spans = discussionSpans([
            u('s1', 'SUBJECT_DISCUSSION', 10), u('s2', 'SUBJECT_DISCUSSION', 20), u('s2', 'VOTE', 30),
            u('s1', 'SUBJECT_DISCUSSION', 40), u('s1', 'VOTE', 50),
        ]);
        expect(spans.get('s1')).toEqual([
            { start: 10, end: 11, hasVote: false },
            { start: 40, end: 51, hasVote: true },
        ]);
        expect(spans.get('s2')).toEqual([{ start: 20, end: 31, hasVote: true }]);
    });

    it('does not split at a joint vote tagged to one of the two subjects', () => {
        // Samothraki jul28_2026: items 5 and 6 are voted in one sentence, tagged to item 5.
        const spans = discussionSpans([
            u('s5', 'SUBJECT_DISCUSSION', 918), u('s6', 'SUBJECT_DISCUSSION', 992), u('s5', 'VOTE', 1088),
        ]);
        expect(spans.get('s5')).toEqual([{ start: 918, end: 1089, hasVote: true }]);
    });

    it('does not split at another subject\'s procedural vote, or at a discussion without a vote', () => {
        const spans = discussionSpans([
            u('s1', 'SUBJECT_DISCUSSION', 10), u('oa1', 'PROCEDURAL_VOTE', 20), u('s2', 'SUBJECT_DISCUSSION', 25),
            u('s1', 'VOTE', 30),
        ]);
        expect(spans.get('s1')).toEqual([{ start: 10, end: 31, hasVote: true }]);
    });

    it('ends a span with the procedural votes that follow it, up to an utterance of another subject', () => {
        const spans = discussionSpans([
            u('s1', 'PROCEDURAL_VOTE', 5), u('s1', 'SUBJECT_DISCUSSION', 10), u('s1', 'PROCEDURAL_VOTE', 12),
            u(null, null, 14), u('s1', 'PROCEDURAL_VOTE', 16), u('s2', 'SUBJECT_DISCUSSION', 20),
            u('s1', 'PROCEDURAL_VOTE', 22), u('s2', 'VOTE', 30), u('s1', 'VOTE', 40),
        ]);
        expect(spans.get('s1')).toEqual([
            { start: 10, end: 17, hasVote: false },
            { start: 40, end: 41, hasVote: true },
        ]);
    });
});

describe('the sections of Athens jul29_2_2026', () => {
    // Item 2 is discussed until 17632, and the council votes to postpone it:
    // «θα συνεχίσουμε το θέμα όταν επιστρέψει ο Δήμαρχος» (procedural votes to
    // 17698). Items 8–11 are discussed and voted, «να συνεχίσουμε το θέμα 2;» is
    // asked at 20249, and item 2 is resumed at 20257 and voted.
    const utterances = [
        makeUtterance({ id: 'a1', startTimestamp: 17311, endTimestamp: 17313, discussionSubjectId: 's2', discussionStatus: 'SUBJECT_DISCUSSION' }),
        makeUtterance({ id: 'a2', startTimestamp: 17629, endTimestamp: 17632, discussionSubjectId: 's2', discussionStatus: 'SUBJECT_DISCUSSION' }),
        makeUtterance({ id: 'p1', startTimestamp: 17632, endTimestamp: 17634, discussionSubjectId: 's2', discussionStatus: 'PROCEDURAL_VOTE' }),
        makeUtterance({ id: 'gap1', startTimestamp: 17646, endTimestamp: 17649 }),
        makeUtterance({ id: 'p2', startTimestamp: 17696, endTimestamp: 17698, discussionSubjectId: 's2', discussionStatus: 'PROCEDURAL_VOTE' }),
        makeUtterance({ id: 'b1', startTimestamp: 17698.8, endTimestamp: 17701, discussionSubjectId: 's8', discussionStatus: 'SUBJECT_DISCUSSION' }),
        makeUtterance({ id: 'b2', startTimestamp: 17780, endTimestamp: 17781, discussionSubjectId: 's8', discussionStatus: 'VOTE' }),
        makeUtterance({ id: 'c1', startTimestamp: 20150, endTimestamp: 20154, discussionSubjectId: 's11', discussionStatus: 'SUBJECT_DISCUSSION' }),
        makeUtterance({ id: 'c2', startTimestamp: 20241, endTimestamp: 20244, discussionSubjectId: 's11', discussionStatus: 'VOTE' }),
        makeUtterance({ id: 'gap2', startTimestamp: 20249, endTimestamp: 20252 }),
        makeUtterance({ id: 'a3', startTimestamp: 20257, endTimestamp: 20272, discussionSubjectId: 's2', discussionStatus: 'SUBJECT_DISCUSSION' }),
        makeUtterance({ id: 'a4', startTimestamp: 20400, endTimestamp: 20402, discussionSubjectId: 's2', discussionStatus: 'VOTE' }),
    ];
    const subjects = [
        { id: 's2', agendaItemIndex: 2, nonAgendaReason: null, discussedIn: null },
        { id: 's8', agendaItemIndex: 8, nonAgendaReason: null, discussedIn: null },
        { id: 's11', agendaItemIndex: 11, nonAgendaReason: null, discussedIn: null },
    ];

    it('prints the procedural vote to postpone item 2 at the end of its first stretch', () => {
        const order = orderedMinutesSubjects(subjects, discussionOrderKeys(utterances)).map(s => s.id);
        const windows = computeTemporalWindows(utterances, order);

        const result = assignUtterances(utterances, windows, order);

        expect(order).toEqual(['s8', 's11', 's2']);
        expect(windows.filter(w => w.subjectId === 's2')).toEqual([
            { subjectId: 's2', start: 17311, end: 17698 },
            { subjectId: 's2', start: 20257, end: 20402 },
        ]);
        expect(result.utterancesBySubject.get('s2')?.map(u => u.id)).toEqual(['a1', 'a2', 'p1', 'gap1', 'p2', 'gap2', 'a3', 'a4']);
        expect(result.crossSubjectMap.get('s2')).toBeUndefined();
        expect(result.preDiscussionByIndex.get(0)).toBeUndefined();
        expect(result.utterancesBySubject.get('s8')?.map(u => u.id)).toEqual(['b1', 'b2']);
    });

    it('does not read the procedural votes into the order', () => {
        const withoutProcedural = utterances.filter(u => u.discussionStatus !== 'PROCEDURAL_VOTE');

        expect(discussionOrderKeys(utterances)).toEqual(discussionOrderKeys(withoutProcedural));
    });
});

describe('the sections of Sparta may6_2026', () => {
    // «το θέμα το 5ο πάει τελευταίο προς συζήτηση» at 363: item 5 is stopped,
    // items 6–14 are discussed and voted, and item 5 is resumed at 715 and voted.
    const rows = spartaMay6 as { item: number | null; status: DiscussionStatus | null; start: number; end: number }[];
    const utterances = rows.map((r, i) => makeUtterance({
        id: `u${i}`,
        startTimestamp: r.start,
        endTimestamp: r.end,
        discussionSubjectId: r.item === null ? null : `s${r.item}`,
        discussionStatus: r.status,
    }));
    const subjectIds = Array.from({ length: 14 }, (_, i) => `s${i + 1}`);
    const subjects = subjectIds.map((id, i) => ({ id, agendaItemIndex: i + 1, nonAgendaReason: null, discussedIn: null }));
    const sortedIds = orderedMinutesSubjects(subjects, discussionOrderKeys(utterances)).map(s => s.id);

    it('gives item 5 two windows, and items 6–14 windows of their own between them', () => {
        const windows = computeTemporalWindows(utterances, subjectIds);

        const item5 = windows.filter(w => w.subjectId === 's5');
        expect(item5.map(w => [Math.floor(w.start), Math.floor(w.end)])).toEqual([[287, 365], [715, 732]]);
        const between = windows.filter(w => w.start > item5[0].end && w.start < item5[1].start).map(w => w.subjectId);
        expect(between).toEqual(['s6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14']);
    });

    it('holds in each section only the utterances of its own item', () => {
        const result = assignUtterances(utterances, computeTemporalWindows(utterances, subjectIds), sortedIds);

        for (const id of subjectIds) {
            const own = utterances.filter(u => u.discussionSubjectId === id).map(u => u.id);
            expect(result.utterancesBySubject.get(id)?.map(u => u.id) ?? []).toEqual(own);
            expect(result.crossSubjectMap.get(id)).toBeUndefined();
        }
        // Item 5's section: 287–363, then from 715 where the discussion resumes.
        const item5 = result.utterancesBySubject.get('s5') ?? [];
        const resumed = item5.filter(u => result.resumedAt.has(u.id));
        expect(resumed.map(u => Math.floor(u.startTimestamp))).toEqual([715]);
        expect(item5.map(u => Math.floor(u.startTimestamp)).filter(t => t < 715).every(t => t <= 363)).toBe(true);

        const assigned = result.preambleUtterances.length + result.epilogueUtterances.length
            + [...result.utterancesBySubject.values()].reduce((n, l) => n + l.length, 0)
            + [...result.preDiscussionByIndex.values()].reduce((n, l) => n + l.length, 0);
        expect(assigned).toBe(utterances.length);
    });

    it('gives the same order, windows and assignment through minutesSections, which the minutes and the sections script call', () => {
        // A withdrawn subject and a subject before the agenda: the order keeps the record subjects, withdrawn
        // ones included; the windows and the assignment leave the withdrawn subject out.
        const withdrawn = { id: 'w', agendaItemIndex: 15, nonAgendaReason: null, discussedIn: null, withdrawn: true };
        const beforeAgenda = { id: 'b', agendaItemIndex: null, nonAgendaReason: 'beforeAgenda', discussedIn: null, withdrawn: false };
        const result = minutesSections([...subjects.map(s => ({ ...s, withdrawn: false })), withdrawn, beforeAgenda], utterances);

        expect(result.ordered.map(s => s.id)).toEqual([...sortedIds, 'w']);
        expect(result.windows).toEqual(computeTemporalWindows(utterances, subjectIds));
        expect(result.assignment).toEqual(assignUtterances(utterances, computeTemporalWindows(utterances, subjectIds), sortedIds));
    });
});
