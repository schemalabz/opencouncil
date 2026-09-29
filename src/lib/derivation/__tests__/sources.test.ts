import { isMeetingFactsReading, sourceFactsFromReading, subjectsOfRange, utteranceIdsOfReading, type SourceContext } from '../sources';
import type { MeetingFactsReading } from '@/lib/apiTypes';
import type { OrderedSubject } from '../types';

const subjects: OrderedSubject[] = [
    { id: 'oa1', name: 'Εκτός 1', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda', decisionNumber: null },
    ...[1, 2, 3].map(i => ({ id: `s${i}`, name: `Θέμα ${i}`, agendaItemIndex: i, nonAgendaReason: null, decisionNumber: null })),
];
const ctx: SourceContext = {
    subjects,
    rosterPersonIds: new Set(['a', 'b', 'c']),
    speakerPersonByUtterance: new Map([['u7', 'b']]),
    partyByPerson: new Map([['a', 'party1'], ['b', 'party2']]),
    partyIdByName: new Map([['Λαϊκή Συσπείρωση', 'party1']]),
};
const reading = (o: Partial<MeetingFactsReading> = {}): MeetingFactsReading => ({
    rollCall: null, attendanceChanges: [], votes: [], presidedBy: null, nameMatches: [], unmatchedNames: [], warnings: [], ...o,
});

describe('subjectsOfRange', () => {
    it('covers agenda items by number and out-of-agenda items by ordinal', () => {
        expect(subjectsOfRange(subjects, { kind: 'agenda_item', from: 2, to: 3 }).map(s => s.id)).toEqual(['s2', 's3']);
        expect(subjectsOfRange(subjects, { kind: 'agenda_item', from: 3, to: 2 }).map(s => s.id)).toEqual(['s2', 's3']);
        expect(subjectsOfRange(subjects, { kind: 'out_of_agenda', from: 1, to: 1 }).map(s => s.id)).toEqual(['oa1']);
        expect(subjectsOfRange(subjects, { kind: 'agenda_item', from: 9, to: 9 })).toEqual([]);
    });
});

describe('sourceFactsFromReading', () => {
    it('reads the roll call, one row per person, ids outside the roster dropped', () => {
        const r = sourceFactsFromReading('sheet', reading({ rollCall: { rawText: '', utteranceIds: [], entries: [
            { name: 'Α', personId: 'a', status: 'PRESENT', absenceJustified: null, rawText: '1. Α ✓', utteranceId: null, line: 1 },
            { name: 'Β', personId: 'b', status: 'ABSENT', absenceJustified: true, rawText: '2. Β', utteranceId: null, line: 2 },
            { name: 'Α again', personId: 'a', status: 'ABSENT', absenceJustified: null, rawText: '', utteranceId: null, line: 3 },
            { name: 'Ξ', personId: 'x', status: 'PRESENT', absenceJustified: null, rawText: '', utteranceId: null, line: 4 },
            { name: 'Nobody', personId: null, status: 'PRESENT', absenceJustified: null, rawText: '', utteranceId: null, line: 5 },
        ] } }), ctx);
        expect(r.rollCall).toEqual([
            { personId: 'a', status: 'PRESENT', source: 'sheet', absenceJustified: null, rawText: '1. Α ✓', evidence: { line: 1 } },
            { personId: 'b', status: 'ABSENT', source: 'sheet', absenceJustified: true, rawText: '2. Β', evidence: { line: 2 } },
        ]);
    });

    it('reads a stated change with its evidence, and a per-vote absence as a pair on the item', () => {
        const r = sourceFactsFromReading('transcript', reading({ attendanceChanges: [
            { personId: 'a', name: 'Α', type: 'arrival', anchor: { kind: 'agenda_item', agendaItemIndex: 2, nonAgendaReason: null, decisionNumber: null, subjectId: null, phase: null, timing: 'before' },
              rawText: 'προσήλθε πριν το 2ο', reportingPdfCount: 1, totalPdfCount: 1, utteranceId: 'u3', line: null },
            { personId: 'b', name: 'Β', type: 'absent_for_vote', anchor: { kind: 'agenda_item', agendaItemIndex: 3, nonAgendaReason: null, decisionNumber: null, subjectId: null, phase: null, timing: null },
              rawText: 'απών στο 3ο', reportingPdfCount: 1, totalPdfCount: 1, utteranceId: null, line: 9 },
            { personId: null, name: 'Nobody', type: 'departure', anchor: { kind: 'session_end', agendaItemIndex: null, nonAgendaReason: null, decisionNumber: null, subjectId: null, phase: null, timing: null },
              rawText: '', reportingPdfCount: 1, totalPdfCount: 1, utteranceId: null, line: null },
        ] }), ctx);
        expect(r.statedChanges).toEqual([
            expect.objectContaining({ personId: 'a', kind: 'ARRIVAL', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 2, timing: 'BEFORE', evidence: { utteranceId: 'u3' } }),
            expect.objectContaining({ personId: 'b', kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 3, timing: 'BEFORE', evidence: { line: 9 } }),
            expect.objectContaining({ personId: 'b', kind: 'ARRIVAL', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 3, timing: 'AFTER', evidence: { line: 9 } }),
        ]);
    });

    it('expands a vote over its items, resolves a party answer by the speaker, and reports a statement with no item', () => {
        const r = sourceFactsFromReading('transcript', reading({ votes: [
            { items: [{ kind: 'agenda_item', from: 1, to: 2 }], outcome: 'unanimous', phrase: 'ομόφωνα', namedVotes: [], partyVotes: [], rawText: 'τα δύο πρώτα ομόφωνα', utteranceIds: ['u1'], line: null, confidence: 90 },
            { items: [{ kind: 'agenda_item', from: 3, to: 3 }], outcome: 'majority', phrase: 'κατά πλειοψηφία',
              namedVotes: [{ name: 'Α', personId: 'a', vote: 'AGAINST', rawText: 'Α: κατά', utteranceId: 'u5' }],
              partyVotes: [{ party: null, speakerUtteranceId: 'u7', vote: 'AGAINST', rawText: 'Εμείς κατά' }, { party: 'Λαϊκή Συσπείρωση', speakerUtteranceId: null, vote: 'FOR', rawText: 'Η ΛΑΣ υπέρ' }],
              rawText: 'κατά πλειοψηφία', utteranceIds: ['u6'], line: null, confidence: 80 },
            { items: [], outcome: 'unanimous', phrase: 'ομόφωνα', namedVotes: [], partyVotes: [], rawText: 'ομόφωνα, ποιο θέμα;', utteranceIds: ['u9'], line: null, confidence: 20 },
        ] }), ctx);
        expect(r.votes.map(v => v.subjectId)).toEqual(['s1', 's2', 's3']);
        expect(r.votes[0]).toMatchObject({ source: 'transcript', decisionId: null, voteResultPhrase: 'ομόφωνα', statedOutcome: 'unanimous', evidence: { utteranceId: 'u1' } });
        expect(r.votes[2].namedVotes).toEqual([{ personId: 'a', vote: 'AGAINST', evidence: { utteranceId: 'u5' } }]);
        expect(r.votes[2].partyVotes).toEqual([
            { partyId: 'party2', vote: 'AGAINST', rawText: 'Εμείς κατά', evidence: { utteranceId: 'u7' } },
            { partyId: 'party1', vote: 'FOR', rawText: 'Η ΛΑΣ υπέρ', evidence: { utteranceId: 'u6' } },
        ]);
        expect(r.unplacedVotes).toEqual([{ rawText: 'ομόφωνα, ποιο θέμα;', evidence: { utteranceId: 'u9' } }]);
    });

    it('leaves a party the city does not know unresolved instead of handing the vote to the speaker\'s party', () => {
        const r = sourceFactsFromReading('transcript', reading({ votes: [
            { items: [{ kind: 'agenda_item', from: 1, to: 1 }], outcome: 'majority', phrase: 'κατά πλειοψηφία', namedVotes: [],
              partyVotes: [{ party: 'Άγνωστη Παράταξη', speakerUtteranceId: 'u7', vote: 'AGAINST', rawText: 'Η Άγνωστη κατά' }],
              rawText: 'κατά πλειοψηφία', utteranceIds: ['u6'], line: null, confidence: 80 },
        ] }), ctx);
        expect(r.votes[0].partyVotes).toEqual([{ partyId: null, vote: 'AGAINST', rawText: 'Η Άγνωστη κατά', evidence: { utteranceId: 'u7' } }]);
    });

    it('survives a reading that is not one', () => {
        const r = sourceFactsFromReading('sheet', { garbage: true }, ctx);
        expect(r).toMatchObject({ source: 'sheet', rollCall: null, statedChanges: [], votes: [], unplacedVotes: [], unmatchedNames: [] });
        expect(isMeetingFactsReading({ garbage: true })).toBe(false);
        expect(isMeetingFactsReading(reading())).toBe(true);
    });

    it('names the utterances a reading needs the speakers of', () => {
        expect(utteranceIdsOfReading(reading({ votes: [{ items: [], outcome: null, phrase: '', namedVotes: [], partyVotes: [{ party: null, speakerUtteranceId: 'u7', vote: 'FOR', rawText: '' }], rawText: '', utteranceIds: [], line: null, confidence: 50 }] }))).toEqual(['u7']);
    });
});
