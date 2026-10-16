import { deriveMeetingFacts } from '../deriveMeetingFacts';
import type { DerivationInput, DocumentFacts, RollCallRow, SourceFacts, VoteFacts } from '../types';

/**
 * The sheet and the transcript beside the pages: which source supplies each
 * fact, and how a disagreement is reported (issue #807).
 */
const subjects = [1, 2, 3].map(i => ({ id: `s${i}`, name: `Θέμα ${i}`, agendaItemIndex: i, nonAgendaReason: null, decisionNumber: null }));
const page = (subjectId: string, o: Partial<DocumentFacts> = {}): DocumentFacts => ({
    subjectId, decisionId: `d-${subjectId}`, voteResultPhrase: 'Ομόφωνα', namedVotes: [], tally: null, presentIds: null, absentIds: null,
    rollCallPresentIds: ['a', 'b'], rollCallAbsentIds: ['c'], lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] },
    statedChanges: [], perVoteAbsences: [], nameMatches: null, unmatchedNames: [], incomplete: false, rollCallLayout: null,
    declaredItemNumber: null, declaredOutOfAgenda: null, mayorPresent: null, presidedById: null, presidedByName: null, actingSecretaryId: null,
    hasExtraction: true, statesBodyDecision: true, closingBlockCut: false, closingReadFailed: false, ...o,
});
const vote = (source: VoteFacts['source'], subjectId: string, o: Partial<VoteFacts> = {}): VoteFacts => ({
    subjectId, source, decisionId: null, voteResultPhrase: null, statedOutcome: 'unanimous', namedVotes: [], partyVotes: [], tally: null, rawText: 'ομόφωνα', ...o,
});
const source = (o: Partial<SourceFacts> & { source: SourceFacts['source'] }): SourceFacts => ({
    rollCall: null, statedChanges: [], votes: [], unplacedVotes: [], presidedById: null, presidedByName: null, nameMatches: null, unmatchedNames: [], ...o,
});
const base: DerivationInput = {
    cityId: 'c', meetingId: 'm', subjects, rollCall: [], events: [], documents: [], sources: [],
    partyMembers: new Map([['party1', ['a', 'b']]]), subjectIdsWithStoredVotes: [], conventions: null, bodyType: 'council',
    mayorPersonId: null, presidentPersonId: null, secretaryPersonId: null, cityMayorPersonId: null,
};
const sheetRollCall = (): RollCallRow[] => [
    { personId: 'a', status: 'PRESENT', source: 'sheet', absenceJustified: null, rawText: '1. a', evidence: { line: 1 } },
    { personId: 'b', status: 'PRESENT', source: 'sheet', absenceJustified: null, rawText: '2. b', evidence: { line: 2 } },
    { personId: 'c', status: 'ABSENT', source: 'sheet', absenceJustified: true, rawText: '3. c', evidence: { line: 3 } },
];
const statusOf = (out: ReturnType<typeof deriveMeetingFacts>, subjectId: string, personId: string) =>
    out.attendance.find(a => a.subjectId === subjectId && a.personId === personId);

describe('deriveMeetingFacts with the sheet and the transcript', () => {
    it('a confirmed sheet with no page gives the roll call, the presence and the votes, all of source sheet', () => {
        const sheet = source({ source: 'sheet', rollCall: sheetRollCall(), votes: [vote('sheet', 's1'), vote('sheet', 's2', { statedOutcome: 'majority', namedVotes: [{ personId: 'b', vote: 'AGAINST', evidence: { line: 12 } }] })] });
        const out = deriveMeetingFacts({ ...base, sources: [sheet] });
        expect(out.rollCall).toEqual(expect.arrayContaining([expect.objectContaining({ personId: 'c', status: 'ABSENT', source: 'sheet', absenceJustified: true })]));
        expect(statusOf(out, 's1', 'a')).toMatchObject({ status: 'PRESENT', source: 'sheet' });
        expect(out.votes.filter(v => v.subjectId === 's1')).toEqual(expect.arrayContaining([
            { subjectId: 's1', personId: 'a', voteType: 'FOR', origin: 'inferred', source: 'sheet' },
            { subjectId: 's1', personId: 'b', voteType: 'FOR', origin: 'inferred', source: 'sheet' },
        ]));
        expect(out.votes.find(v => v.subjectId === 's2' && v.personId === 'b')).toMatchObject({ voteType: 'AGAINST', origin: 'stated', source: 'sheet' });
        expect(out.votes.filter(v => v.subjectId === 's3')).toEqual([]);
        expect(out.issues.filter(i => i.code !== 'CONVENTIONS_UNCONFIRMED')).toEqual([]);
    });

    it('the transcript supplies a vote the sheet does not state, and an unplaced statement is reported', () => {
        const sheet = source({ source: 'sheet', rollCall: sheetRollCall() });
        const transcript = source({ source: 'transcript', votes: [vote('transcript', 's3', { evidence: { utteranceId: 'u9' } })], unplacedVotes: [{ rawText: 'ομόφωνα, ποιο;', evidence: { utteranceId: 'u2' } }] });
        const out = deriveMeetingFacts({ ...base, sources: [sheet, transcript] });
        expect(out.votes.find(v => v.subjectId === 's3' && v.personId === 'a')).toMatchObject({ voteType: 'FOR', source: 'transcript' });
        expect(out.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNPLACEABLE_VOTE', source: 'transcript', rawText: 'ομόφωνα, ποιο;', evidence: { utteranceId: 'u2' } })]));
    });

    it('the sheet outranks the transcript on the roll call and on a vote, and each loss is one issue with the loser\'s evidence', () => {
        const sheet = source({ source: 'sheet', rollCall: sheetRollCall(), votes: [vote('sheet', 's1', { statedOutcome: 'majority', namedVotes: [{ personId: 'a', vote: 'AGAINST', evidence: { line: 20 } }] })] });
        const transcript = source({
            source: 'transcript',
            rollCall: [{ personId: 'c', status: 'PRESENT', source: 'transcript', absenceJustified: null, rawText: 'Ο κύριος c παρών', evidence: { utteranceId: 'u1' } }],
            votes: [vote('transcript', 's1', { statedOutcome: 'unanimous', evidence: { utteranceId: 'u5' } })],
        });
        const out = deriveMeetingFacts({ ...base, sources: [sheet, transcript] });
        expect(statusOf(out, 's1', 'c')).toMatchObject({ status: 'ABSENT', source: 'sheet' });
        expect(out.votes.find(v => v.subjectId === 's1' && v.personId === 'a')).toMatchObject({ voteType: 'AGAINST', source: 'sheet' });
        const disagreements = out.issues.filter(i => i.code === 'SOURCES_DISAGREE');
        expect(disagreements).toEqual(expect.arrayContaining([
            expect.objectContaining({ personId: 'c', params: { kind: 'rollCall', winSource: 'sheet', winStatus: 'ABSENT', loseSource: 'transcript', loseStatus: 'PRESENT' } }),
            expect.objectContaining({ subjectId: 's1', evidence: { utteranceId: 'u5' }, params: { kind: 'outcome', winSource: 'sheet', winOutcome: 'majority', loseSource: 'transcript', loseOutcome: 'unanimous' } }),
        ]));
    });

    it('a page outranks both once it is read, and the sheet\'s different vote is reported against it', () => {
        const sheet = source({ source: 'sheet', rollCall: sheetRollCall(), votes: [vote('sheet', 's1', { statedOutcome: 'majority', namedVotes: [{ personId: 'b', vote: 'AGAINST', evidence: { line: 8 } }] })] });
        const out = deriveMeetingFacts({ ...base, documents: [page('s1')], sources: [sheet] });
        expect(out.votes.find(v => v.subjectId === 's1' && v.personId === 'b')).toMatchObject({ voteType: 'FOR', origin: 'inferred', source: 'decision' });
        expect(out.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'SOURCES_DISAGREE', subjectId: 's1', personId: 'b', evidence: { line: 8 }, params: { kind: 'vote', winSource: 'decision', winVote: 'FOR', loseSource: 'sheet', loseVote: 'AGAINST' } }),
            expect.objectContaining({ code: 'SOURCES_DISAGREE', subjectId: 's1', params: expect.objectContaining({ kind: 'outcome', winOutcome: 'unanimous', loseOutcome: 'majority' }) }),
        ]));
        // One roll call per meeting: the page's wins for c on every subject, and the
        // sheet, which says the same, is not reported.
        expect(statusOf(out, 's2', 'c')).toMatchObject({ status: 'ABSENT', source: 'decision' });
        expect(out.issues.filter(i => i.code === 'SOURCES_DISAGREE' && i.personId === 'c')).toEqual([]);
    });

    it('a party\'s answer gives the vote to its members present, and a rejected unanimous vote gives AGAINST', () => {
        const transcript = source({
            source: 'transcript',
            rollCall: sheetRollCall().map(r => ({ ...r, source: 'transcript' as const })),
            votes: [
                vote('transcript', 's1', { statedOutcome: 'majority', partyVotes: [{ partyId: 'party1', vote: 'AGAINST', rawText: 'Εμείς κατά', evidence: { utteranceId: 'u3' } }] }),
                vote('transcript', 's2', { statedOutcome: 'rejected', voteResultPhrase: 'Ομόφωνα' }),
                vote('transcript', 's3', { partyVotes: [{ partyId: null, vote: 'FOR', rawText: 'Εμείς υπέρ', evidence: { utteranceId: 'u4' } }] }),
            ],
        });
        const out = deriveMeetingFacts({ ...base, sources: [transcript] });
        expect(out.votes.filter(v => v.subjectId === 's1').map(v => [v.personId, v.voteType, v.origin])).toEqual(expect.arrayContaining([['a', 'AGAINST', 'stated'], ['b', 'AGAINST', 'stated']]));
        expect(out.votes.filter(v => v.subjectId === 's2').map(v => v.voteType)).toEqual(['AGAINST', 'AGAINST']);
        expect(out.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PARTY_VOTE_UNRESOLVED', subjectId: 's3', evidence: { utteranceId: 'u4' }, params: { vote: 'FOR' } })]));
    });

    it('a FOR a page infers over the sheet\'s presence is the sheet\'s fact too, and is labelled so', () => {
        // The page states «Ομόφωνα» and prints no roll call; the sheet says who was in the room.
        const sheet = source({ source: 'sheet', rollCall: sheetRollCall() });
        const out = deriveMeetingFacts({ ...base, sources: [sheet], documents: [page('s1', { rollCallPresentIds: [], rollCallAbsentIds: [] })], subjects: [subjects[0]] });
        expect(out.votes.filter(v => v.subjectId === 's1')).toEqual(expect.arrayContaining([
            { subjectId: 's1', personId: 'a', voteType: 'FOR', origin: 'inferred', source: 'sheet' },
            { subjectId: 's1', personId: 'b', voteType: 'FOR', origin: 'inferred', source: 'sheet' },
        ]));
        // With the page's own roll call, the same inference is the page's fact.
        const out2 = deriveMeetingFacts({ ...base, sources: [sheet], documents: [page('s1')], subjects: [subjects[0]] });
        expect(out2.votes.find(v => v.personId === 'a')).toMatchObject({ voteType: 'FOR', origin: 'inferred', source: 'decision' });
    });

    it('labels all of a subject\'s inferred votes alike, so the public page never prints part of the room', () => {
        // The page's roll call names a and b; the sheet adds c, present. c's presence rests on the sheet.
        const sheet = source({ source: 'sheet', rollCall: sheetRollCall().map(r => ({ ...r, status: 'PRESENT' as const, absenceJustified: null })) });
        const out = deriveMeetingFacts({ ...base, sources: [sheet], documents: [page('s1', { rollCallPresentIds: ['a', 'b'], rollCallAbsentIds: [] })], subjects: [subjects[0]] });
        const inferred = out.votes.filter(v => v.origin === 'inferred');
        expect(inferred.map(v => v.personId).sort()).toEqual(['a', 'b', 'c']);
        expect(new Set(inferred.map(v => v.source))).toEqual(new Set(['sheet']));
    });

    it('a named FOR from the transcript does not end the inference for the rest of the room', () => {
        const transcript = source({
            source: 'transcript',
            rollCall: sheetRollCall().map(r => ({ ...r, source: 'transcript' as const })),
            // The chair polled two leaders: one for, one against; «κατά πλειοψηφία».
            votes: [vote('transcript', 's1', { statedOutcome: 'majority', voteResultPhrase: 'κατά πλειοψηφία', namedVotes: [{ personId: 'a', vote: 'FOR' }, { personId: 'b', vote: 'AGAINST' }] })],
        });
        const out = deriveMeetingFacts({ ...base, sources: [transcript], subjects: [subjects[0]] });
        expect(out.votes.map(v => [v.personId, v.voteType, v.origin]).sort()).toEqual([['a', 'FOR', 'stated'], ['b', 'AGAINST', 'stated']]);
        // c is absent on the roll call; with c present the inferred FOR appears.
        const present = source({ ...transcript, rollCall: transcript.rollCall!.map(r => ({ ...r, status: 'PRESENT' as const })) });
        const out2 = deriveMeetingFacts({ ...base, sources: [present], subjects: [subjects[0]] });
        expect(out2.votes.find(v => v.personId === 'c')).toMatchObject({ voteType: 'FOR', origin: 'inferred' });
    });
});
