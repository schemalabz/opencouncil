import { deriveMeetingFacts } from '../deriveMeetingFacts';
import type { DerivationInput } from '../types';

const base: DerivationInput = {
    cityId: 'c', meetingId: 'm', mayorPersonId: 'mayor', presidentPersonId: null, secretaryPersonId: null, subjectIdsWithStoredVotes: [],
    bodyType: null, cityMayorPersonId: null,
    subjects: [{ id: 's1', name: 'one', agendaItemIndex: 1, nonAgendaReason: null, decisionNumber: '10' }, { id: 's2', name: 'two', agendaItemIndex: 2, nonAgendaReason: null, decisionNumber: '11' }],
    rollCall: [{ personId: 'p1', status: 'PRESENT', source: 'decision' }, { personId: 'p2', status: 'PRESENT', source: 'decision' }, { personId: 'mayor', status: 'ABSENT', source: 'decision' }],
    events: [],
    documents: [
        { subjectId: 's1', decisionId: 'd1', voteResultPhrase: 'Ομόφωνα', namedVotes: [], tally: null, presentIds: null, absentIds: null, rollCallPresentIds: null, rollCallAbsentIds: null, lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], perVoteAbsences: [], nameMatches: null, unmatchedNames: ['Άγνωστος Α.'], incomplete: false, rollCallLayout: 'present_and_absent', declaredItemNumber: 1, declaredOutOfAgenda: false, mayorPresent: false, presidedById: 'p9', presidedByName: 'Αντιπρόεδρος', actingSecretaryId: null , hasExtraction: true},
        { subjectId: 's2', decisionId: 'd2', voteResultPhrase: 'Κατά πλειοψηφία', namedVotes: [{ personId: 'p2', vote: 'AGAINST' }], tally: null, presentIds: null, absentIds: null, rollCallPresentIds: null, rollCallAbsentIds: null, lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], perVoteAbsences: [], nameMatches: null, unmatchedNames: [], incomplete: true, rollCallLayout: 'present_and_absent', declaredItemNumber: 2, declaredOutOfAgenda: false, mayorPresent: false, presidedById: 'p8', presidedByName: 'Άλλος', actingSecretaryId: null , hasExtraction: true},
    ],
    conventions: { version: 1, rollCallLayout: 'present_and_absent', presentListMeaning: 'opening', attendanceChangeAnchors: ['agenda_item'], statesPerDecisionAttendance: false,
        statesPerVoteAbsence: false, usesSubstitutes: false, namedVoters: 'dissenters_only', mayorStatedSeparately: true, provenance: { source: 'profile' } },
};

describe('deriveMeetingFacts', () => {
    it('produces rows for every subject and the document-level issues', () => {
        const out = deriveMeetingFacts(base);
        expect(out.attendance.filter(a => a.subjectId === 's1').map(a => a.personId).sort()).toEqual(['p1', 'p2']);
        expect(out.votes).toEqual(expect.arrayContaining([
            { subjectId: 's1', personId: 'p1', voteType: 'FOR', origin: 'inferred' },
            { subjectId: 's2', personId: 'p2', voteType: 'AGAINST', origin: 'stated' },
            { subjectId: 's2', personId: 'p1', voteType: 'FOR', origin: 'inferred' },
        ]));
        const codes = out.issues.map(i => i.code).sort();
        expect(codes).toEqual(['CONVENTIONS_UNCONFIRMED', 'INCOMPLETE_READ', 'PRESIDING_DISAGREES', 'UNMATCHED_NAME']);
        expect(out.issues.find(i => i.code === 'UNMATCHED_NAME')).toMatchObject({ subjectId: 's1', decisionId: 'd1', rawText: 'Άγνωστος Α.' });
    });
    it('says why there is no roll call when a caller derives without the guard', () => {
        const page = (present: string[], absent: string[]) => ({ ...base.documents[0], rollCallPresentIds: present, rollCallAbsentIds: absent });
        const reason = (documents: DerivationInput['documents']) => deriveMeetingFacts({ ...base, rollCall: [], documents }).issues.find(i => i.code === 'NO_ROLL_CALL')?.params;
        expect(reason([page(['p1'], ['p2']), page(['p2'], ['p1'])])).toEqual({ reason: 'noMajority' });
        expect(reason([base.documents[0]])).toEqual({ reason: 'noRollCall' });
    });
    it('is deterministic', () => {
        expect(deriveMeetingFacts(base)).toEqual(deriveMeetingFacts(base));
    });
    it('a member a per-decision present list omits is absent, and gets no inferred FOR', () => {
        const out = deriveMeetingFacts({
            ...base,
            conventions: { ...base.conventions!, statesPerDecisionAttendance: true, rollCallLayout: 'present_only' },
            documents: [{ ...base.documents[0], presentIds: ['p1'], absentIds: null }, base.documents[1]],
        });
        expect(out.attendance.find(a => a.subjectId === 's1' && a.personId === 'p2')).toMatchObject({ status: 'ABSENT', origin: 'stated' });
        expect(out.votes.filter(v => v.subjectId === 's1').map(v => v.personId)).toEqual(['p1']);
        expect(out.issues.filter(i => i.code === 'IMPLIED_CHANGE')).toHaveLength(1);
    });
    it('reports the layout a document printed against the one the body was profiled with', () => {
        const out = deriveMeetingFacts({ ...base, documents: [{ ...base.documents[0], rollCallLayout: 'composition_and_absent' }, base.documents[1]] });
        expect(out.issues.filter(i => i.code === 'LAYOUT_DISAGREES')).toEqual([
            expect.objectContaining({ subjectId: 's1', decisionId: 'd1', params: { expected: 'present_and_absent', found: 'composition_and_absent' } }),
        ]);
    });
    it('a body whose layout varies is contradicted by no single document', () => {
        const out = deriveMeetingFacts({
            ...base, conventions: { ...base.conventions!, rollCallLayout: 'mixed' },
            documents: [{ ...base.documents[0], rollCallLayout: 'composition_and_absent' }, base.documents[1]],
        });
        expect(out.issues.filter(i => i.code === 'LAYOUT_DISAGREES')).toEqual([]);
    });
    it('reports a document whose declared item number is not the one it is linked to', () => {
        const out = deriveMeetingFacts({ ...base, documents: [{ ...base.documents[0], declaredItemNumber: 7 }, base.documents[1]] });
        expect(out.issues.filter(i => i.code === 'ITEM_NUMBER_DISAGREES')).toEqual([
            expect.objectContaining({ subjectId: 's1', decisionId: 'd1', params: { declared: 7, linked: 1 } }),
        ]);
    });
    it('an out-of-agenda document counts its own items, so its number is never compared', () => {
        // Both sides differ here on purpose: the subject carries no agendaItemIndex
        // and «3ο θέμα εκτός ημερήσιας διάταξης» counts the out-of-agenda items.
        const out = deriveMeetingFacts({
            ...base,
            subjects: [{ ...base.subjects[0], agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' }, base.subjects[1]],
            documents: [{ ...base.documents[0], declaredItemNumber: 3, declaredOutOfAgenda: true }, base.documents[1]],
        });
        expect(out.issues.filter(i => i.code === 'ITEM_NUMBER_DISAGREES')).toEqual([]);
    });
    it('warns when a page names voters unlike its body, and changes no vote row', () => {
        const namesFor = { ...base.documents[0], namedVotes: [{ personId: 'p1', vote: 'FOR' as const }] };
        const out = deriveMeetingFacts({ ...base, documents: [namesFor, base.documents[1]] });
        expect(out.issues.filter(i => i.code === 'NAMED_VOTERS_UNEXPECTED')).toEqual([
            expect.objectContaining({ subjectId: 's1', params: { expected: 'dissenters_only' } }),
        ]);
        const all = deriveMeetingFacts({ ...base, conventions: { ...base.conventions!, namedVoters: 'all' } });
        expect(all.issues.filter(i => i.code === 'NAMED_VOTERS_UNEXPECTED').map(i => i.subjectId)).toEqual(['s1', 's2']);
    });

    it('accepts a unanimous page whose named voters all cast one vote, on a body that names every voter', () => {
        // Athens 4η 9ΖΘΨΩ6Μ-Θ0Ζ: nine members named ΚΑΤΑ, then «ΑΠΟΦΑΣΙΖΕΙ ΟΜΟΦΩΝΑ Δεν εγκρίνει».
        const conventions = { ...base.conventions!, namedVoters: 'all' as const };
        const rejection = { ...base.documents[0], voteResultPhrase: 'ΑΠΟΦΑΣΙΖΕΙ ΟΜΟΦΩΝΑ', namedVotes: [{ personId: 'p1', vote: 'AGAINST' as const }, { personId: 'p2', vote: 'AGAINST' as const }] };
        const unexpected = (documents: DerivationInput['documents']) =>
            deriveMeetingFacts({ ...base, conventions, documents }).issues.filter(i => i.code === 'NAMED_VOTERS_UNEXPECTED').map(i => i.subjectId);
        expect(unexpected([rejection])).toEqual([]);
        // Two different votes under «ομόφωνα», or one vote under a majority, still name nobody FOR.
        expect(unexpected([{ ...rejection, namedVotes: [{ personId: 'p1', vote: 'AGAINST' }, { personId: 'p2', vote: 'ABSTAIN' }] }])).toEqual(['s1']);
        expect(unexpected([{ ...rejection, voteResultPhrase: 'Κατά πλειοψηφία' }])).toEqual(['s1']);
        // The page must name every member present: p1 and p2 are present, and only p1 is named.
        // Nobody FOR under «ομόφωνα» with a partial list is the symptom of lost FOR names.
        expect(unexpected([{ ...rejection, namedVotes: [{ personId: 'p1', vote: 'AGAINST' }] }])).toEqual(['s1']);
        // With no presence known, nothing shows that the page named every member.
        const noPresence = deriveMeetingFacts({ ...base, conventions, rollCall: [], documents: [rejection] });
        expect(noPresence.issues.filter(i => i.code === 'NAMED_VOTERS_UNEXPECTED').map(i => i.subjectId)).toEqual(['s1']);
    });

    it('expects every voter named on a split vote and nobody on a unanimous one, for an all_when_split body', () => {
        const conventions = { ...base.conventions!, namedVoters: 'all_when_split' as const };
        const page = (voteResultPhrase: string, namedVotes: DerivationInput['documents'][number]['namedVotes']) =>
            ({ ...base.documents[0], voteResultPhrase, namedVotes });
        const unexpected = (doc: DerivationInput['documents'][number]) =>
            deriveMeetingFacts({ ...base, conventions, documents: [doc] }).issues.filter(i => i.code === 'NAMED_VOTERS_UNEXPECTED').map(i => i.params);
        // As the body writes it: nobody under «Ομόφωνα», everyone under «κατά πλειοψηφία».
        expect(unexpected(page('Ομόφωνα', []))).toEqual([]);
        expect(unexpected(page('Κατά πλειοψηφία', [{ personId: 'p1', vote: 'FOR' }, { personId: 'p2', vote: 'AGAINST' }]))).toEqual([]);
        // A unanimous rejection names every voter with one vote.
        expect(unexpected(page('ΑΠΟΦΑΣΙΖΕΙ ΟΜΟΦΩΝΑ', [{ personId: 'p1', vote: 'AGAINST' }, { personId: 'p2', vote: 'AGAINST' }]))).toEqual([]);
        expect(unexpected(page('ΑΠΟΦΑΣΙΖΕΙ ΟΜΟΦΩΝΑ', [{ personId: 'p2', vote: 'AGAINST' }]))).toEqual([{ expected: 'all_when_split' }]);
        // A split vote that names nobody, or only the dissenters, is unlike the body.
        expect(unexpected(page('Κατά πλειοψηφία', []))).toEqual([{ expected: 'all_when_split' }]);
        expect(unexpected(page('Κατά πλειοψηφία', [{ personId: 'p2', vote: 'AGAINST' }]))).toEqual([{ expected: 'all_when_split' }]);
        // A counted phrase that names no outcome does not say whether the vote was split.
        expect(unexpected(page('Με πέντε (5) θετικές ψήφους', []))).toEqual([]);
    });

    it('reports a vote the page names for a member its departure made absent', () => {
        // p2 left before item 2, and the page of item 2 still names p2 AGAINST.
        const out = deriveMeetingFacts({ ...base, events: [{ id: 'e1', personId: 'p2', kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 1,
            anchorNonAgendaReason: null, anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: 'AFTER', rawText: 'αποχώρησε μετά το 1ο θέμα',
            reportingDocuments: 1, totalDocuments: 1, source: 'manual' }] });
        expect(out.issues.filter(i => i.code === 'VOTE_BY_ABSENT_MEMBER')).toEqual([
            expect.objectContaining({ subjectId: 's2', personId: 'p2', decisionId: 'd2', params: { vote: 'AGAINST' } }),
        ]);
        expect(out.votes).toContainEqual({ subjectId: 's2', personId: 'p2', voteType: 'AGAINST', origin: 'stated' });
        expect(deriveMeetingFacts(base).issues.filter(i => i.code === 'VOTE_BY_ABSENT_MEMBER')).toEqual([]);
    });

    it("does not count the mayor's own FOR as naming voters", () => {
        const mayorFor = { ...base.documents[0], namedVotes: [{ personId: 'mayor', vote: 'FOR' as const }] };
        // cityMayorPersonId, not mayorPersonId: a mayor written apart from the
        // members is excluded from this check on every body, committees included.
        expect(deriveMeetingFacts({ ...base, cityMayorPersonId: 'mayor', documents: [mayorFor, base.documents[1]] }).issues.filter(i => i.code === 'NAMED_VOTERS_UNEXPECTED')).toEqual([]);
    });

    it('still derives when the present-list meaning is unknown', () => {
        const out = deriveMeetingFacts({ ...base, conventions: { ...base.conventions!, presentListMeaning: 'unknown' } });
        expect(out.phraseOnlySubjectIds).toEqual([]);
        expect(out.votes.filter(v => v.origin === 'inferred').length).toBeGreaterThan(0);
        // No arrival is stated here, so the meaning could not have changed a row.
        expect(out.issues.filter(i => i.code === 'PRESENCE_UNKNOWN')).toEqual([]);
    });
    describe('per-vote absences on a per_decision body (C5)', () => {
        // Four items; the member p2 is out for the votes on items 2 and 3, and each of those pages says so.
        const subjects = [1, 2, 3, 4].map(i => ({ id: `s${i}`, name: `${i}`, agendaItemIndex: i, nonAgendaReason: null, decisionNumber: `${9 + i}` }));
        const conventions = { ...base.conventions!, presentListMeaning: 'per_decision' as const, statesPerDecisionAttendance: true };
        const outForVote = [{ personId: 'p2', decisionNumberFrom: null, decisionNumberTo: null, rawText: 'απουσίαζε ο p2' }];
        const pageOf = (i: number, present: string[], absent: string[], members: string[], out: boolean) => ({
            ...base.documents[0], subjectId: `s${i}`, decisionId: `d${i}`, unmatchedNames: [], presidedById: null, presidedByName: null,
            rollCallPresentIds: present, rollCallAbsentIds: absent, presentIds: members, perVoteAbsences: out ? outForVote : [],
        });
        const derive = (documents: DerivationInput['documents']) => deriveMeetingFacts({ ...base, rollCall: [], mayorPersonId: null, subjects, conventions, documents });
        const absentOn = (out: ReturnType<typeof derive>) => subjects.filter(s => out.attendance.some(a => a.subjectId === s.id && a.personId === 'p2' && a.status === 'ABSENT')).map(s => s.id);
        const attendanceIssues = (out: ReturnType<typeof derive>) => out.issues.filter(i => ['SOURCES_DISAGREE', 'IMPLIED_CHANGE', 'LIST_DROPS_PRESENT', 'LIST_ADDS_ABSENT'].includes(i.code));

        it('raises no contradiction where the pages own lists already mark the member absent', () => {
            const out = derive([
                pageOf(1, ['p1', 'p2'], [], ['p1', 'p2'], false), pageOf(2, ['p1'], ['p2'], ['p1'], true),
                pageOf(3, ['p1'], ['p2'], ['p1'], true), pageOf(4, ['p1', 'p2'], [], ['p1', 'p2'], false),
            ]);
            expect(out.events.map(e => [e.kind, e.anchorSubjectId])).toEqual([['DEPARTURE', 's2'], ['ARRIVAL', 's4']]);
            expect(absentOn(out)).toEqual(['s2', 's3']);
            expect(attendanceIssues(out)).toEqual([]);
        });

        it('keeps the member absent on a later page of the run whose roll call lists them present', () => {
            // ΠΑΡΟΝΤΕΣ names p2 on items 2 and 3. ΤΑ ΜΕΛΗ leaves p2 out: `documentFactsFromDecision` removes a member out for the vote.
            const out = derive([
                pageOf(1, ['p1', 'p2'], [], ['p1', 'p2'], false), pageOf(2, ['p1', 'p2'], [], ['p1'], true),
                pageOf(3, ['p1', 'p2'], [], ['p1'], true), pageOf(4, ['p1', 'p2'], [], ['p1', 'p2'], false),
            ]);
            expect(absentOn(out)).toEqual(['s2', 's3']);
            expect(attendanceIssues(out)).toEqual([]);
        });
    });

    describe('the roll call and the changes the pages state', () => {
        const departure = { personId: 'p2', kind: 'DEPARTURE' as const, anchorKind: 'AGENDA_ITEM' as const, anchorAgendaItemIndex: 1, anchorNonAgendaReason: null,
            anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: 'AFTER' as const, rawText: 'αποχώρησε μετά το 1ο θέμα' };
        const pages = base.documents.map(d => ({ ...d, rollCallPresentIds: ['p1', 'p2'], rollCallAbsentIds: [], statedChanges: [departure] }));

        it('are resolved over every page and returned as output, and the replay reads them', () => {
            const out = deriveMeetingFacts({ ...base, rollCall: [], documents: pages });
            expect(out.rollCall).toEqual([{ personId: 'p1', status: 'PRESENT', source: 'decision' }, { personId: 'p2', status: 'PRESENT', source: 'decision' }]);
            expect(out.events).toEqual([expect.objectContaining({ personId: 'p2', kind: 'DEPARTURE', reportingDocuments: 2, totalDocuments: 2, source: 'decision' })]);
            expect(out.attendance.find(a => a.subjectId === 's2' && a.personId === 'p2')).toMatchObject({ status: 'ABSENT' });
        });

        it('rank below a row another source states', () => {
            const out = deriveMeetingFacts({ ...base, rollCall: [{ personId: 'p1', status: 'ABSENT', source: 'manual' }], documents: pages });
            expect(out.attendance.find(a => a.subjectId === 's1' && a.personId === 'p1')).toMatchObject({ status: 'ABSENT' });
            expect(out.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SOURCES_DISAGREE', personId: 'p1' })]));
            // The output is the pages' own statement, not the ranked result.
            expect(out.rollCall.find(r => r.personId === 'p1')).toMatchObject({ status: 'PRESENT', source: 'decision' });
        });
    });
});
