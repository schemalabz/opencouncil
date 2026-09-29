import { compareSources, sumAgreement } from '../compareSources';
import type { DerivationInput, DocumentFacts, SourceFacts } from '@/lib/derivation/types';

const subjects = [1, 2].map(i => ({ id: `s${i}`, name: `Θέμα ${i}`, agendaItemIndex: i, nonAgendaReason: null, decisionNumber: null }));
const page = (subjectId: string, o: Partial<DocumentFacts> = {}): DocumentFacts => ({
    subjectId, decisionId: `d-${subjectId}`, voteResultPhrase: 'Ομόφωνα', namedVotes: [], tally: null, presentIds: null, absentIds: null,
    rollCallPresentIds: ['a', 'b'], rollCallAbsentIds: ['c'], lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] },
    statedChanges: [], perVoteAbsences: [], nameMatches: null, unmatchedNames: [], incomplete: false, rollCallLayout: null,
    declaredItemNumber: null, declaredOutOfAgenda: null, mayorPresent: null, presidedById: null, presidedByName: null, actingSecretaryId: null,
    hasExtraction: true, statesBodyDecision: true, closingBlockCut: false, closingReadFailed: false, ...o,
});
const transcript: SourceFacts = {
    source: 'transcript',
    rollCall: [
        { personId: 'a', status: 'PRESENT', source: 'transcript', rawText: 'a παρών', evidence: { utteranceId: 'u1' } },
        { personId: 'c', status: 'PRESENT', source: 'transcript', rawText: 'c παρών', evidence: { utteranceId: 'u3' } },
        { personId: 'z', status: 'PRESENT', source: 'transcript', rawText: 'z παρών', evidence: { utteranceId: 'u4' } },
    ],
    statedChanges: [],
    votes: [
        { subjectId: 's1', source: 'transcript', decisionId: null, voteResultPhrase: 'ομόφωνα', statedOutcome: 'unanimous', namedVotes: [], partyVotes: [], tally: null, rawText: 'ομόφωνα', evidence: { utteranceId: 'u10' } },
        { subjectId: 's2', source: 'transcript', decisionId: null, voteResultPhrase: 'κατά πλειοψηφία', statedOutcome: 'majority', namedVotes: [{ personId: 'b', vote: 'FOR', evidence: { utteranceId: 'u12' } }], partyVotes: [], tally: null, rawText: 'κατά πλειοψηφία', evidence: { utteranceId: 'u11' } },
    ],
    unplacedVotes: [], presidedById: null, presidedByName: null, nameMatches: null, unmatchedNames: [],
};
const input: DerivationInput = {
    cityId: 'c', meetingId: 'm', subjects, rollCall: [], events: [], sources: [transcript], partyMembers: new Map(),
    documents: [page('s1'), page('s2', { voteResultPhrase: 'Κατά πλειοψηφία', namedVotes: [{ personId: 'b', vote: 'AGAINST' }] })],
    subjectIdsWithStoredVotes: [], conventions: null, bodyType: 'council', mayorPersonId: null, presidentPersonId: null, secretaryPersonId: null, cityMayorPersonId: null,
};

describe('compareSources', () => {
    it('counts each fact both sides state, and lists every disagreement with its evidence', () => {
        const [r] = compareSources(input);
        // z is on no page, so only a and c compare; c disagrees.
        expect(r.rollCall).toEqual({ compared: 2, agreed: 1 });
        expect(r.outcomes).toEqual({ compared: 2, agreed: 2 });
        expect(r.votes).toEqual({ compared: 1, agreed: 0 });
        expect(r.disagreements).toEqual([
            { source: 'transcript', fact: 'rollCall', subjectId: null, personId: 'c', page: 'ABSENT', stated: 'PRESENT', evidence: { utteranceId: 'u3' }, decisionId: null },
            { source: 'transcript', fact: 'vote', subjectId: 's2', personId: 'b', page: 'AGAINST', stated: 'FOR', evidence: { utteranceId: 'u12' }, decisionId: 'd-s2' },
        ]);
    });

    it('compares nothing in a meeting whose pages are unread', () => {
        expect(compareSources({ ...input, documents: input.documents.map(d => ({ ...d, hasExtraction: false })) })).toEqual([]);
    });

    it('sums per source', () => {
        const rows = compareSources(input);
        const sum = sumAgreement([...rows, ...rows]);
        expect(sum.get('transcript')?.rollCall).toEqual({ compared: 4, agreed: 2 });
    });
});
