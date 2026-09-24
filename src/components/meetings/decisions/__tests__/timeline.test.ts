import { buildTimeline, hasDiscussionOrder, isPendingDecision, minutesReadiness } from '@/components/meetings/decisions/timeline';
import type { MinutesSubject, MinutesProceduralVote, MinutesAttendanceChange, MinutesCouncilComposition } from '@/lib/minutes/types';
import type { MinutesMember } from '@/lib/minutes/types';
import type { TimelineItem } from '@/components/meetings/decisions/timeline';

const member = (name: string): MinutesMember => ({ personId: name, name, party: null, isPartyHead: false, role: null });
const members = (n: number): MinutesMember[] => Array.from({ length: n }, (_, i) => member(`m${i}`));

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

/** No roll-call data: most buildTimeline tests don't care about the roll call's own count. */
const noComposition = { councilComposition: null, absentMembers: null } as const;

describe('buildTimeline', () => {
    it('puts the roll call first with the count from composition and absentees', () => {
        const councilComposition: MinutesCouncilComposition = {
            mayor: null,
            president: null,
            members: [member('Α'), member('Β'), member('Γ')],
            substituteMembers: [member('Δ')],
        };
        const { rollCall } = buildTimeline({
            subjects: [],
            attendanceChanges: [],
            proceduralVotes: [],
            councilComposition,
            absentMembers: [member('Α'), member('Β')],
        });
        expect(rollCall).toEqual({ count: { present: 2, absent: 2 }, absentNames: ['Α', 'Β'], presentNames: ['Γ', 'Δ'] });
    });

    it('gives the roll call a null count when there is no council composition', () => {
        const { rollCall } = buildTimeline({
            subjects: [],
            attendanceChanges: [],
            proceduralVotes: [],
            councilComposition: null,
            absentMembers: [member('Α')],
        });
        expect(rollCall).toEqual({ count: null, absentNames: [], presentNames: [] });
    });

    it('excludes an absent mayor from both the count and the absent names, since the composition pool never held them', () => {
        const mayor = member('mayor');
        const councilComposition: MinutesCouncilComposition = {
            mayor,
            president: null,
            members: members(3),
            substituteMembers: [],
        };
        const { rollCall } = buildTimeline({
            subjects: [],
            attendanceChanges: [],
            proceduralVotes: [],
            councilComposition,
            absentMembers: [mayor, member('m1')],
        });
        expect(rollCall).toEqual({ count: { present: 2, absent: 1 }, absentNames: ['m1'], presentNames: ['m0', 'm2'] });
    });

    it('puts a normal absence in both the count and the absent names', () => {
        const councilComposition: MinutesCouncilComposition = {
            mayor: null,
            president: null,
            members: members(3),
            substituteMembers: [],
        };
        const { rollCall } = buildTimeline({
            subjects: [],
            attendanceChanges: [],
            proceduralVotes: [],
            councilComposition,
            absentMembers: [member('m1')],
        });
        expect(rollCall).toEqual({ count: { present: 2, absent: 1 }, absentNames: ['m1'], presentNames: ['m0', 'm2'] });
    });

    it('lists the council composition\'s members and substitutes not among the absentees as presentNames', () => {
        const councilComposition: MinutesCouncilComposition = {
            mayor: null,
            president: null,
            members: [member('Α'), member('Β'), member('Γ')],
            substituteMembers: [member('Δ')],
        };
        const { rollCall } = buildTimeline({
            subjects: [],
            attendanceChanges: [],
            proceduralVotes: [],
            councilComposition,
            absentMembers: [member('Β')],
        });
        expect(rollCall).toMatchObject({ presentNames: ['Α', 'Γ', 'Δ'] });
    });

    it('attaches a subject with discussedWith to its parent and drops it as its own item', () => {
        const parent = subject({ subjectId: 'p' });
        const child = subject({ subjectId: 'c', discussedWith: { id: 'p', name: 'p', agendaItemIndex: 1, nonAgendaReason: null } });
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [parent, child],
            attendanceChanges: [],
            proceduralVotes: [],
        });
        const subjectItems = items.filter(i => i.type === 'subject');
        expect(subjectItems.map(i => i.subjectId)).toEqual(['p']);
        expect(subjectItems[0]).toMatchObject({ subjectId: 'p', children: [{ subject: child, withdrawnAt: null }] });
    });

    it('gives an orphan child its own item when its named parent is not in the list', () => {
        const orphan = subject({ subjectId: 'c', discussedWith: { id: 'missing', name: 'missing', agendaItemIndex: 1, nonAgendaReason: null } });
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [orphan],
            attendanceChanges: [],
            proceduralVotes: [],
        });
        const subjectItems = items.filter(i => i.type === 'subject');
        expect(subjectItems.map(i => i.subjectId)).toEqual(['c']);
        expect(subjectItems[0]).toMatchObject({ subjectId: 'c', children: [] });
    });

    it('keeps a withdrawn subject in its place among the other items', () => {
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [subject({ subjectId: 'a' }), subject({ subjectId: 'w', withdrawn: true }), subject({ subjectId: 'b' })],
            attendanceChanges: [],
            proceduralVotes: [],
        });
        expect(items.filter(i => i.type === 'subject').map(i => i.subjectId)).toEqual(['a', 'w', 'b']);
    });

    it('sets withdrawnAt from the withdrawn subject\'s procedural vote', () => {
        const vote: MinutesProceduralVote = { subjectId: 'w', timestamp: 555 };
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [subject({ subjectId: 'w', withdrawn: true })],
            attendanceChanges: [],
            proceduralVotes: [vote],
        });
        const w = items.find(i => i.type === 'subject' && i.subjectId === 'w');
        expect(w).toMatchObject({ withdrawnAt: 555 });
    });

    it('puts every withdrawn subject with a procedural vote in withdrawnAtById, children included', () => {
        const parent = subject({ subjectId: 'p' });
        const withdrawnChild = subject({
            subjectId: 'w',
            withdrawn: true,
            discussedWith: { id: 'p', name: 'p', agendaItemIndex: 1, nonAgendaReason: null },
        });
        const vote: MinutesProceduralVote = { subjectId: 'w', timestamp: 777 };
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [parent, withdrawnChild],
            attendanceChanges: [],
            proceduralVotes: [vote],
        });
        const group = items.find(i => i.type === 'subject') as Extract<TimelineItem, { type: 'subject' }>;
        expect(group.children.map(c => [c.subject.subjectId, c.withdrawnAt])).toEqual([['w', 777]]);
    });

    it('gives an observed change its own presence item, before the subject it was seen at', () => {
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [subject({ subjectId: 'a', attendance: { present: members(3), absent: members(0) } })],
            attendanceChanges: [{ personId: 'p1', name: 'Α', type: 'arrival', atSubject: at('a') }],
            proceduralVotes: [],
        });
        expect(items.map(i => i.type)).toEqual(['presence', 'subject']);
        expect(items[0]).toEqual({ type: 'presence', atSubjectId: 'a', observedAtId: 'a', arrivals: ['Α'], departures: [] });
    });

    it('anchors a change observed at a grouped child before the parent item', () => {
        const parent = subject({ subjectId: 'p', attendance: { present: members(5), absent: members(1) } });
        const child = subject({ subjectId: 'c', discussedWith: { id: 'p', name: 'p', agendaItemIndex: 1, nonAgendaReason: null }, attendance: null });
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [parent, child],
            attendanceChanges: [{ personId: 'per1', name: 'Person1', type: 'arrival', atSubject: at('c') }],
            proceduralVotes: [],
        });
        expect(items.map(i => i.type)).toEqual(['presence', 'subject']);
        expect(items[0]).toMatchObject({ type: 'presence', atSubjectId: 'p', arrivals: ['Person1'] });
        expect(items[1]).toMatchObject({ type: 'subject', subjectId: 'p' });
    });

    it('gives two changes observed at two children of one group two separate presence items, both anchored to the parent, each naming its own child', () => {
        const parent = subject({ subjectId: 'p', attendance: { present: members(5), absent: members(1) } });
        const first = subject({
            subjectId: 'c1',
            discussedWith: { id: 'p', name: 'p', agendaItemIndex: 1, nonAgendaReason: null },
            attendance: { present: members(4), absent: members(2) },
        });
        const second = subject({
            subjectId: 'c2',
            discussedWith: { id: 'p', name: 'p', agendaItemIndex: 1, nonAgendaReason: null },
            attendance: { present: members(3), absent: members(3) },
        });
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [parent, first, second],
            attendanceChanges: [
                { personId: 'per1', name: 'Person1', type: 'departure', atSubject: at('c1') },
                { personId: 'per2', name: 'Person2', type: 'departure', atSubject: at('c2') },
            ],
            proceduralVotes: [],
        });
        expect(items.map(i => i.type)).toEqual(['presence', 'presence', 'subject']);
        expect(items[0]).toMatchObject({
            type: 'presence',
            atSubjectId: 'p',
            observedAtId: 'c1',
            departures: ['Person1'],
        });
        expect(items[1]).toMatchObject({
            type: 'presence',
            atSubjectId: 'p',
            observedAtId: 'c2',
            departures: ['Person2'],
        });
        // Both items anchor before the parent's row.
        expect(items[2]).toMatchObject({ type: 'subject', subjectId: 'p' });
    });

    it('still produces a presence item for a change observed at a child of an attendance-less parent', () => {
        const parent = subject({ subjectId: 'p', attendance: null });
        const child = subject({ subjectId: 'c', discussedWith: { id: 'p', name: 'p', agendaItemIndex: 1, nonAgendaReason: null }, attendance: null });
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [parent, child],
            attendanceChanges: [{ personId: 'per1', name: 'Person1', type: 'arrival', atSubject: at('c') }],
            proceduralVotes: [],
        });
        expect(items.map(i => i.type)).toEqual(['presence', 'subject']);
        expect(items[0]).toMatchObject({ type: 'presence', atSubjectId: 'p', arrivals: ['Person1'] });
    });

    it('carries the observed subject id on the presence item, for labeling the row where the change was actually seen', () => {
        const parent = subject({ subjectId: 'p', attendance: { present: members(5), absent: members(1) } });
        const child = subject({
            subjectId: 'c',
            discussedWith: { id: 'p', name: 'p', agendaItemIndex: 1, nonAgendaReason: null },
            attendance: null,
        });
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [parent, child],
            attendanceChanges: [{ personId: 'per1', name: 'Person1', type: 'arrival', atSubject: at('c') }],
            proceduralVotes: [],
        });
        expect(items[0]).toMatchObject({ type: 'presence', atSubjectId: 'p', observedAtId: 'c' });
    });

    it('keeps a change observed at an orphan child on that child', () => {
        const orphan = subject({ subjectId: 'c', discussedWith: { id: 'missing', name: 'missing', agendaItemIndex: 1, nonAgendaReason: null }, attendance: { present: members(3), absent: members(0) } });
        const { items } = buildTimeline({
            ...noComposition,
            subjects: [orphan],
            attendanceChanges: [{ personId: 'per1', name: 'Person1', type: 'arrival', atSubject: at('c') }],
            proceduralVotes: [],
        });
        expect(items.map(i => i.type)).toEqual(['presence', 'subject']);
        expect(items[0]).toMatchObject({ type: 'presence', atSubjectId: 'c', arrivals: ['Person1'] });
        expect(items[1]).toMatchObject({ type: 'subject', subjectId: 'c' });
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

describe('isPendingDecision', () => {
    it('is pending when a live subject has no decision', () => {
        expect(isPendingDecision({ withdrawn: false }, false)).toBe(true);
    });

    it('is not pending once the subject has a decision', () => {
        expect(isPendingDecision({ withdrawn: false }, true)).toBe(false);
    });

    it('is never pending for a withdrawn subject, which was never going to get one', () => {
        expect(isPendingDecision({ withdrawn: true }, false)).toBe(false);
    });
});

describe('minutesReadiness', () => {
    const linked: MinutesSubject['decision'] =
        { decisionNumber: '643/2026', protocolNumber: null, excerpt: null, references: null };

    it('counts the subjects the minutes snapshot still carries without a decision', () => {
        // The count used to come off the decisions payload, a separate request.
        // Read off the minutes, it describes the document the preview renders
        // and the DOCX is built from.
        expect(minutesReadiness({ subjects: [
            subject({ subjectId: 's1', decision: linked }),
            subject({ subjectId: 's2' }),
            subject({ subjectId: 's3' }),
        ] })).toEqual({ subjects: 3, undecided: 2 });
    });

    it('leaves a withdrawn subject out of both counts, the way isPendingDecision does', () => {
        expect(minutesReadiness({ subjects: [
            subject({ subjectId: 's1', decision: linked }),
            subject({ subjectId: 's2', withdrawn: true }),
        ] })).toEqual({ subjects: 1, undecided: 0 });
    });
});
