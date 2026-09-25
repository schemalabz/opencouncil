import { deriveMeetingFacts } from '../deriveMeetingFacts';
import type { DerivationInput } from '../types';

const base: DerivationInput = {
    cityId: 'c', meetingId: 'm', mayorPersonId: 'mayor', presidentPersonId: null, secretaryPersonId: null, subjectIdsWithStoredVotes: [],
    bodyType: null, cityMayorPersonId: null,
    subjects: [{ id: 's1', name: 'one', agendaItemIndex: 1, nonAgendaReason: null, decisionNumber: '10' }, { id: 's2', name: 'two', agendaItemIndex: 2, nonAgendaReason: null, decisionNumber: '11' }],
    rollCall: [{ personId: 'p1', status: 'PRESENT', source: 'decision' }, { personId: 'p2', status: 'PRESENT', source: 'decision' }, { personId: 'mayor', status: 'ABSENT', source: 'decision' }],
    events: [],
    documents: [
        { subjectId: 's1', decisionId: 'd1', voteResultPhrase: 'Ομόφωνα', namedVotes: [], tally: null, presentIds: null, absentIds: null, rollCallPresentIds: null, rollCallAbsentIds: null, lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], nameMatches: null, unmatchedNames: ['Άγνωστος Α.'], incomplete: false, rollCallLayout: 'present_and_absent', declaredItemNumber: 1, declaredOutOfAgenda: false, mayorPresent: false, presidedById: 'p9', presidedByName: 'Αντιπρόεδρος', actingSecretaryId: null , hasExtraction: true},
        { subjectId: 's2', decisionId: 'd2', voteResultPhrase: 'Κατά πλειοψηφία', namedVotes: [{ personId: 'p2', vote: 'AGAINST' }], tally: null, presentIds: null, absentIds: null, rollCallPresentIds: null, rollCallAbsentIds: null, lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], nameMatches: null, unmatchedNames: [], incomplete: true, rollCallLayout: 'present_and_absent', declaredItemNumber: 2, declaredOutOfAgenda: false, mayorPresent: false, presidedById: 'p8', presidedByName: 'Άλλος', actingSecretaryId: null , hasExtraction: true},
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
    it('still derives when the present-list meaning is unknown', () => {
        const out = deriveMeetingFacts({ ...base, conventions: { ...base.conventions!, presentListMeaning: 'unknown' } });
        expect(out.phraseOnlySubjectIds).toEqual([]);
        expect(out.votes.filter(v => v.origin === 'inferred').length).toBeGreaterThan(0);
        // No arrival is stated here, so the meaning could not have changed a row.
        expect(out.issues.filter(i => i.code === 'PRESENCE_UNKNOWN')).toEqual([]);
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
