import { AttendanceStatus, VoteType } from '@prisma/client';
import {
    buildAttendance,
    buildVoteResult,
    buildCouncilComposition,
    sortSubjectsByDiscussionOrder,
    sortByElectedOrder,
    MemberResolver,
    ElectedOrderGetter,
} from '../builders';
import { MinutesMember } from '../types';

// --- Test helpers ---

/** Simple resolver that formats name surname-first and attaches no party/role info. */
const simpleResolver: MemberResolver = (personId, name) => ({
    personId,
    name: `resolved-${name}`,
    party: null,
    isPartyHead: false,
    role: null,
});

/** Resolver that attaches party info based on personId prefix. */
const partyResolver: MemberResolver = (personId, name) => ({
    personId,
    name: `resolved-${name}`,
    party: personId.startsWith('nd-') ? 'ΝΔ' : personId.startsWith('syriza-') ? 'ΣΥΡΙΖΑ' : null,
    isPartyHead: personId.endsWith('-head'),
    role: personId.startsWith('mayor-') ? 'Δήμαρχος' : null,
});

/** No elected order for anyone. */
const noElectedOrder: ElectedOrderGetter = () => null;

/** Elected order from a lookup map. */
function makeElectedOrder(orders: Record<string, number>): ElectedOrderGetter {
    return (personId) => orders[personId] ?? null;
}

function makeAttendance(personId: string, name: string, status: AttendanceStatus) {
    return { personId, personName: name, status };
}

function makeVote(personId: string, name: string, voteType: VoteType) {
    return { personId, personName: name, voteType };
}

// --- buildAttendance ---

describe('buildAttendance', () => {
    it('splits attendance into present and absent', () => {
        const attendance = [
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'ABSENT'),
            makeAttendance('p3', 'Charlie', 'PRESENT'),
        ];

        const result = buildAttendance(attendance, null, simpleResolver, noElectedOrder);

        expect(result.present).toHaveLength(2);
        expect(result.absent).toHaveLength(1);
        expect(result.present.map(m => m.personId)).toEqual(['p1', 'p3']);
        expect(result.absent.map(m => m.personId)).toEqual(['p2']);
    });

    it('excludes mayor from both present and absent', () => {
        const attendance = [
            makeAttendance('mayor-1', 'Mayor', 'PRESENT'),
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'ABSENT'),
        ];

        const result = buildAttendance(attendance, 'mayor-1', simpleResolver, noElectedOrder);

        expect(result.present).toHaveLength(1);
        expect(result.absent).toHaveLength(1);
        expect(result.present[0].personId).toBe('p1');
        expect(result.absent[0].personId).toBe('p2');
    });

    it('sorts by elected order (ascending, nulls last)', () => {
        const attendance = [
            makeAttendance('p3', 'Charlie', 'PRESENT'),
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'PRESENT'),
        ];
        const electedOrder = makeElectedOrder({ p1: 3, p2: 1, p3: 2 });

        const result = buildAttendance(attendance, null, simpleResolver, electedOrder);

        expect(result.present.map(m => m.personId)).toEqual(['p2', 'p3', 'p1']);
    });

    it('sorts by name when elected orders are equal', () => {
        const attendance = [
            makeAttendance('p1', 'Ζωή', 'PRESENT'),
            makeAttendance('p2', 'Αλέξης', 'PRESENT'),
        ];

        const result = buildAttendance(attendance, null, simpleResolver, noElectedOrder);

        // Both have null elected order, so sorted by name (Greek: Α before Ζ)
        expect(result.present.map(m => m.personId)).toEqual(['p2', 'p1']);
    });

    it('uses the member resolver for display info', () => {
        const attendance = [
            makeAttendance('nd-1', 'Nikos', 'PRESENT'),
        ];

        const result = buildAttendance(attendance, null, partyResolver, noElectedOrder);

        expect(result.present[0].party).toBe('ΝΔ');
        expect(result.present[0].name).toBe('resolved-Nikos');
    });

    it('returns empty arrays when all are excluded (only mayor)', () => {
        const attendance = [
            makeAttendance('mayor-1', 'Mayor', 'PRESENT'),
        ];

        const result = buildAttendance(attendance, 'mayor-1', simpleResolver, noElectedOrder);

        expect(result.present).toEqual([]);
        expect(result.absent).toEqual([]);
    });

    it('handles empty attendance', () => {
        const result = buildAttendance([], null, simpleResolver, noElectedOrder);

        expect(result.present).toEqual([]);
        expect(result.absent).toEqual([]);
    });
});

// --- buildVoteResult ---

describe('buildVoteResult', () => {
    it('returns null when there are no votes', () => {
        const result = buildVoteResult([], [], null, simpleResolver, noElectedOrder);
        expect(result).toBeNull();
    });

    it('categorizes votes into for/against/abstain', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'AGAINST'),
            makeVote('p3', 'Charlie', 'ABSTAIN'),
            makeVote('p4', 'Diana', 'FOR'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result).not.toBeNull();
        expect(result!.forMembers).toHaveLength(2);
        expect(result!.againstMembers).toHaveLength(1);
        expect(result!.abstainMembers).toHaveLength(1);
    });

    it('detects passed vote (FOR > AGAINST)', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
            makeVote('p3', 'Charlie', 'AGAINST'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result!.passed).toBe(true);
        expect(result!.isUnanimous).toBe(false);
    });

    it('detects failed vote (AGAINST > FOR)', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'AGAINST'),
            makeVote('p3', 'Charlie', 'AGAINST'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result!.passed).toBe(false);
    });

    it('tie does not pass (FOR === AGAINST)', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'AGAINST'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result!.passed).toBe(false);
    });

    it('detects unanimous vote (all FOR)', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
            makeVote('p3', 'Charlie', 'FOR'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result!.isUnanimous).toBe(true);
        expect(result!.passed).toBe(true);
    });

    it('is not unanimous when abstains are present', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
            makeVote('p3', 'Charlie', 'ABSTAIN'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result!.isUnanimous).toBe(false);
        expect(result!.passed).toBe(true);
    });

    it('single FOR vote is unanimous and passed', () => {
        const votes = [makeVote('p1', 'Alice', 'FOR')];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result!.isUnanimous).toBe(true);
        expect(result!.passed).toBe(true);
    });

    it('derives absent members from attendance minus voters minus mayor', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
        ];
        const attendance = [
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'PRESENT'),
            makeAttendance('p3', 'Charlie', 'ABSENT'),
            makeAttendance('p4', 'Diana', 'ABSENT'),
            makeAttendance('mayor-1', 'Mayor', 'PRESENT'),
        ];

        const result = buildVoteResult(votes, attendance, 'mayor-1', simpleResolver, noElectedOrder);

        // p3 and p4 are absent and didn't vote, mayor is excluded
        expect(result!.absentMembers).toHaveLength(2);
        expect(result!.absentMembers.map(m => m.personId)).toEqual(['p3', 'p4']);
    });

    it('does not count present non-voters as absent', () => {
        const votes = [makeVote('p1', 'Alice', 'FOR')];
        const attendance = [
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'PRESENT'), // present but didn't vote
        ];

        const result = buildVoteResult(votes, attendance, null, simpleResolver, noElectedOrder);

        // p2 is PRESENT so not in absentMembers, even though they didn't vote
        expect(result!.absentMembers).toHaveLength(0);
    });

    it('does not double-count voters who are also in attendance', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
        ];
        const attendance = [
            makeAttendance('p1', 'Alice', 'ABSENT'), // marked absent but voted
        ];

        const result = buildVoteResult(votes, attendance, null, simpleResolver, noElectedOrder);

        // p1 voted, so should NOT appear in absentMembers even though marked absent
        expect(result!.absentMembers).toHaveLength(0);
        expect(result!.forMembers).toHaveLength(1);
    });

    it('sorts vote categories by elected order', () => {
        const votes = [
            makeVote('p3', 'Charlie', 'FOR'),
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
        ];
        const electedOrder = makeElectedOrder({ p1: 2, p2: 1, p3: 3 });

        const result = buildVoteResult(votes, [], null, simpleResolver, electedOrder);

        expect(result!.forMembers.map(m => m.personId)).toEqual(['p2', 'p1', 'p3']);
    });
});

// --- buildCouncilComposition ---

describe('buildCouncilComposition', () => {
    const makeMember = (personId: string, name: string): MinutesMember => ({
        personId,
        name,
        party: null,
        isPartyHead: false,
        role: null,
    });

    it('includes mayor with presence status', () => {
        const attendance = { present: [makeMember('p1', 'Alice')], absent: [] };
        const rawPresentIds = new Set(['p1', 'mayor-1']);
        const mayor = { personId: 'mayor-1', name: 'Dimitris Antoniou' };

        const result = buildCouncilComposition(
            attendance, rawPresentIds, mayor, null, 'mayor-1', noElectedOrder,
        );

        expect(result.mayor).toEqual({ name: 'Antoniou Dimitris', present: true });
    });

    it('marks mayor as absent when not in rawPresentIds', () => {
        const attendance = { present: [makeMember('p1', 'Alice')], absent: [] };
        const rawPresentIds = new Set(['p1']);
        const mayor = { personId: 'mayor-1', name: 'Dimitris Antoniou' };

        const result = buildCouncilComposition(
            attendance, rawPresentIds, mayor, null, 'mayor-1', noElectedOrder,
        );

        expect(result.mayor!.present).toBe(false);
    });

    it('includes president with presence status', () => {
        const attendance = { present: [makeMember('p1', 'Alice')], absent: [] };
        const rawPresentIds = new Set(['p1', 'pres-1']);
        const president = { personId: 'pres-1', name: 'Giorgos Papadopoulos' };

        const result = buildCouncilComposition(
            attendance, rawPresentIds, null, president, null, noElectedOrder,
        );

        expect(result.president).toEqual({ name: 'Papadopoulos Giorgos', present: true });
    });

    it('excludes mayor from members list', () => {
        const attendance = {
            present: [makeMember('mayor-1', 'Mayor'), makeMember('p1', 'Alice')],
            absent: [makeMember('p2', 'Bob')],
        };
        const rawPresentIds = new Set(['mayor-1', 'p1']);

        const result = buildCouncilComposition(
            attendance, rawPresentIds, null, null, 'mayor-1', noElectedOrder,
        );

        expect(result.members.map(m => m.personId)).toEqual(['p1', 'p2']);
    });

    it('sorts members by elected order', () => {
        const attendance = {
            present: [
                makeMember('p3', 'Charlie'),
                makeMember('p1', 'Alice'),
                makeMember('p2', 'Bob'),
            ],
            absent: [],
        };
        const rawPresentIds = new Set(['p1', 'p2', 'p3']);
        const electedOrder = makeElectedOrder({ p1: 3, p2: 1, p3: 2 });

        const result = buildCouncilComposition(
            attendance, rawPresentIds, null, null, null, electedOrder,
        );

        expect(result.members.map(m => m.personId)).toEqual(['p2', 'p3', 'p1']);
    });

    it('handles null mayor and president', () => {
        const attendance = { present: [makeMember('p1', 'Alice')], absent: [] };
        const rawPresentIds = new Set(['p1']);

        const result = buildCouncilComposition(
            attendance, rawPresentIds, null, null, null, noElectedOrder,
        );

        expect(result.mayor).toBeNull();
        expect(result.president).toBeNull();
        expect(result.members).toHaveLength(1);
    });

    it('combines present and absent in members list', () => {
        const attendance = {
            present: [makeMember('p1', 'Alice')],
            absent: [makeMember('p2', 'Bob')],
        };
        const rawPresentIds = new Set(['p1']);

        const result = buildCouncilComposition(
            attendance, rawPresentIds, null, null, null, noElectedOrder,
        );

        expect(result.members).toHaveLength(2);
        expect(result.members.map(m => m.personId)).toContain('p1');
        expect(result.members.map(m => m.personId)).toContain('p2');
    });
});

// --- sortSubjectsByDiscussionOrder ---

describe('sortSubjectsByDiscussionOrder', () => {
    function makeSubject(id: string, agendaItemIndex: number | null, opts?: {
        nonAgendaReason?: string | null;
        discussedIn?: { id: string } | null;
    }) {
        return {
            id,
            agendaItemIndex,
            nonAgendaReason: opts?.nonAgendaReason ?? null,
            discussedIn: opts?.discussedIn ?? null,
        };
    }

    it('sorts by first utterance timestamp', () => {
        const subjects = [
            makeSubject('s1', 1),
            makeSubject('s2', 2),
            makeSubject('s3', 3),
        ];
        const timestamps = new Map([['s1', 300], ['s2', 100], ['s3', 200]]);

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['s2', 's3', 's1']);
    });

    it('subjects with transcript come before those without', () => {
        const subjects = [
            makeSubject('s1', 1), // no transcript
            makeSubject('s2', 2), // has transcript
        ];
        const timestamps = new Map([['s2', 100]]);

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['s2', 's1']);
    });

    it('discussedIn child inherits parent timestamp and sorts after parent', () => {
        const subjects = [
            makeSubject('child', 2, { discussedIn: { id: 'parent' } }),
            makeSubject('parent', 1),
        ];
        const timestamps = new Map([['parent', 100]]);

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['parent', 'child']);
    });

    it('outOfAgenda subjects sort after regular agenda items (no transcript)', () => {
        const subjects = [
            makeSubject('ooa', null, { nonAgendaReason: 'outOfAgenda' }),
            makeSubject('agenda', 1),
        ];
        const timestamps = new Map(); // no transcript for either

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['agenda', 'ooa']);
    });

    it('subjects without transcript sort by agenda index', () => {
        const subjects = [
            makeSubject('s3', 3),
            makeSubject('s1', 1),
            makeSubject('s2', 2),
        ];
        const timestamps = new Map();

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['s1', 's2', 's3']);
    });

    it('multiple outOfAgenda subjects without transcript sort by agenda index fallback', () => {
        const subjects = [
            makeSubject('ooa2', null, { nonAgendaReason: 'outOfAgenda' }),
            makeSubject('ooa1', null, { nonAgendaReason: 'outOfAgenda' }),
        ];
        const timestamps = new Map();

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        // Both have agendaItemIndex null → (null ?? 0) = 0 for both → stable order
        expect(result).toHaveLength(2);
    });

    it('does not mutate input array', () => {
        const subjects = [
            makeSubject('s2', 2),
            makeSubject('s1', 1),
        ];
        const original = [...subjects];
        const timestamps = new Map([['s1', 100], ['s2', 200]]);

        sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(subjects).toEqual(original);
    });

    it('handles empty input', () => {
        const result = sortSubjectsByDiscussionOrder([], new Map());
        expect(result).toEqual([]);
    });

    it('child with own transcript uses own timestamp over parent', () => {
        const subjects = [
            makeSubject('child', 2, { discussedIn: { id: 'parent' } }),
            makeSubject('parent', 1),
            makeSubject('other', 3),
        ];
        // child has its own timestamp (discussed separately even though linked)
        const timestamps = new Map([['parent', 100], ['child', 50], ['other', 200]]);

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        // child at 50, parent at 100, other at 200
        expect(result.map(s => s.id)).toEqual(['child', 'parent', 'other']);
    });
});

// --- sortByElectedOrder ---

describe('sortByElectedOrder', () => {
    const makeMember = (personId: string, name: string): MinutesMember => ({
        personId, name, party: null, isPartyHead: false, role: null,
    });

    it('sorts by elected order ascending', () => {
        const a = makeMember('p1', 'Alice');
        const b = makeMember('p2', 'Bob');
        const electedOrder = makeElectedOrder({ p1: 2, p2: 1 });

        expect(sortByElectedOrder(a, b, electedOrder)).toBeGreaterThan(0);
        expect(sortByElectedOrder(b, a, electedOrder)).toBeLessThan(0);
    });

    it('nulls sort last', () => {
        const a = makeMember('p1', 'Alice'); // no elected order
        const b = makeMember('p2', 'Bob');
        const electedOrder = makeElectedOrder({ p2: 1 });

        expect(sortByElectedOrder(a, b, electedOrder)).toBeGreaterThan(0);
    });

    it('falls back to name when elected orders are equal', () => {
        const a = makeMember('p1', 'Ζωή');
        const b = makeMember('p2', 'Αλέξης');

        expect(sortByElectedOrder(a, b, noElectedOrder)).toBeGreaterThan(0);
        expect(sortByElectedOrder(b, a, noElectedOrder)).toBeLessThan(0);
    });
});
