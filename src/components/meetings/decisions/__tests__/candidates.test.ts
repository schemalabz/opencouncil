import { routeCandidates, LIKELY_MATCH_THRESHOLD, isLikelyMatch, splitWaitingSubjects, attentionCount, estimateWork } from '@/components/meetings/decisions/candidates';

const candidate = (id: string, o: Partial<{ subjectId: string | null; conflict: { subjectId: string } | null }> = {}) =>
    ({ id, subjectId: null, conflict: null, ...o });

const subject = (id: string, withdrawn = false) => ({ id, withdrawn });

/** Nothing is linked yet, unless the test says otherwise. */
const nothingLinked = () => false;

describe('routeCandidates', () => {
    it('proposes a candidate on the pending subject it suggests', () => {
        const c = candidate('c1', { subjectId: 's1' });
        const { proposalBySubject, trayCandidates } = routeCandidates([c], [subject('s1')], nothingLinked);
        expect(proposalBySubject.get('s1')).toBe(c);
        expect(trayCandidates).toEqual([]);
    });

    it('trays a candidate that suggests nothing', () => {
        const c = candidate('c1');
        const { proposalBySubject, trayCandidates } = routeCandidates([c], [subject('s1')], nothingLinked);
        expect(proposalBySubject.size).toBe(0);
        expect(trayCandidates).toEqual([c]);
    });

    it('trays a candidate whose suggested subject is not on the page', () => {
        const c = candidate('c1', { subjectId: 'missing' });
        expect(routeCandidates([c], [subject('s1')], nothingLinked).trayCandidates).toEqual([c]);
    });

    it('trays a candidate suggesting a withdrawn subject, which is never pending', () => {
        const c = candidate('c1', { subjectId: 's1' });
        const { proposalBySubject, trayCandidates } = routeCandidates([c], [subject('s1', true)], nothingLinked);
        expect(proposalBySubject.size).toBe(0);
        expect(trayCandidates).toEqual([c]);
    });

    it('trays a candidate suggesting a subject that already has a decision', () => {
        const c = candidate('c1', { subjectId: 's1' });
        const { trayCandidates } = routeCandidates([c], [subject('s1')], id => id === 's1');
        expect(trayCandidates).toEqual([c]);
    });

    it('trays a conflicting candidate rather than proposing it', () => {
        const c = candidate('c1', { subjectId: 's1', conflict: { subjectId: 's2' } });
        const { proposalBySubject, trayCandidates } = routeCandidates([c], [subject('s1')], nothingLinked);
        expect(proposalBySubject.size).toBe(0);
        expect(trayCandidates).toEqual([c]);
    });

    it('gives a subject only its first proposal and trays the rest', () => {
        const first = candidate('c1', { subjectId: 's1' });
        const second = candidate('c2', { subjectId: 's1' });
        const { proposalBySubject, trayCandidates } =
            routeCandidates([first, second], [subject('s1')], nothingLinked);
        expect(proposalBySubject.get('s1')).toBe(first);
        expect(trayCandidates).toEqual([second]);
    });

    it('routes every candidate exactly once — the tray count the tile reports', () => {
        // The unplaced-documents tile counts trayCandidates, so a candidate that
        // falls through both branches, or lands in both, misreports the tile.
        const cs = [
            candidate('c1', { subjectId: 's1' }),
            candidate('c2', { subjectId: 's1' }),
            candidate('c3'),
            candidate('c4', { subjectId: 's2', conflict: { subjectId: 's1' } }),
            candidate('c5', { subjectId: 'gone' }),
        ];
        const { proposalBySubject, trayCandidates } =
            routeCandidates(cs, [subject('s1'), subject('s2')], nothingLinked);
        expect(proposalBySubject.size + trayCandidates.length).toBe(cs.length);
        expect(trayCandidates.map(c => c.id)).toEqual(['c2', 'c3', 'c4', 'c5']);
    });

    it('keys a conflict by the subject already holding the ADA, first one winning', () => {
        const first = candidate('c1', { conflict: { subjectId: 's1' } });
        const second = candidate('c2', { conflict: { subjectId: 's1' } });
        const { conflictsByHolder } = routeCandidates([first, second], [subject('s1')], nothingLinked);
        expect(conflictsByHolder.get('s1')).toBe(first);
        expect(conflictsByHolder.size).toBe(1);
    });
});

describe('isLikelyMatch', () => {
    it('reads a confidence at the threshold as likely', () => {
        expect(isLikelyMatch({ confidence: LIKELY_MATCH_THRESHOLD })).toBe(true);
    });

    it('says nothing below the threshold, where a number would only make a person hesitate', () => {
        expect(isLikelyMatch({ confidence: 0.4 })).toBe(false);
    });

    it('says nothing when the resolver reported no confidence', () => {
        expect(isLikelyMatch({ confidence: null })).toBe(false);
    });
});

describe('splitWaitingSubjects', () => {
    const subjects = [
        { id: 's1', withdrawn: false },
        { id: 's2', withdrawn: false },
        { id: 's3', withdrawn: false },
        { id: 's4', withdrawn: true },
    ];

    it('separates the subjects a proposal waits on from the ones needing a number', () => {
        const proposals = new Map([['s1', { id: 'c1' }]]);
        const result = splitWaitingSubjects(subjects, (id) => id === 's3', proposals);
        expect(result.proposed.map(s => s.id)).toEqual(['s1']);
        expect(result.plain.map(s => s.id)).toEqual(['s2']);
    });

    it('leaves a withdrawn subject out of both: it never needs a decision', () => {
        const result = splitWaitingSubjects(subjects, () => false, new Map());
        expect(result.proposed.concat(result.plain).map(s => s.id)).not.toContain('s4');
    });
});

describe('attentionCount and estimateWork', () => {
    const routed = {
        proposalBySubject: new Map([['s1', { id: 'c1' }]]),
        trayCandidates: [{ id: 'c2' }, { id: 'c3' }],
        conflictsByHolder: new Map([['s9', { id: 'c4' }]]),
    };
    const waiting = { proposed: [{ id: 's1' }], plain: [{ id: 's2' }] };

    it('counts every subject waiting and every decision waiting, and nothing twice', () => {
        // 2 subjects (one of them the proposal's) + 2 tray + 1 conflict
        expect(attentionCount(routed, waiting)).toBe(5);
    });

    it('estimates in whole minutes, rounded up', () => {
        // 20s proposal + 40s plain + 2x40s tray + 40s conflict = 180s
        expect(estimateWork(routed, waiting)).toEqual({ kind: 'minutes', minutes: 3 });
    });

    it('says less than a minute rather than round a small board up', () => {
        const small = { proposalBySubject: new Map([['s1', { id: 'c1' }]]), trayCandidates: [], conflictsByHolder: new Map() };
        expect(estimateWork(small, { proposed: [{ id: 's1' }], plain: [] })).toEqual({ kind: 'underMinute' });
    });

    it('is empty and instant with nothing outstanding', () => {
        const none = { proposalBySubject: new Map(), trayCandidates: [], conflictsByHolder: new Map() };
        expect(attentionCount(none, { proposed: [], plain: [] })).toBe(0);
        expect(estimateWork(none, { proposed: [], plain: [] })).toEqual({ kind: 'underMinute' });
    });
});
