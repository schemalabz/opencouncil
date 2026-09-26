import type { MinutesData } from '@/lib/minutes/types';
import { checkMeeting, type CheckLine } from '../minutes-check';
import type { GoldenMeeting } from '../minutes-golden';

const data = (): MinutesData => ({
    city: { name: 'Άργος', name_municipality: 'Δήμος Άργους-Μυκηνών', timezone: 'Europe/Athens', logoImage: null, realm: 'greece' },
    meeting: { id: 'jul21_2026', cityId: 'argos', name: 'Τακτική Συνεδρίαση', dateTime: '2026-07-21T11:00:00.000Z' },
    administrativeBody: null,
    councilComposition: null,
    absentMembers: null,
    preambleEntries: [],
    attendanceChanges: [],
    attendanceChangesSource: 'diff',
    discussionOrderLabel: null,
    proceduralVotes: [],
    subjects: [],
    epilogueEntries: [],
});

const meeting = (subjects: GoldenMeeting['subjects']): GoldenMeeting =>
    ({ cityId: 'argos', meetingId: 'jul21_2026', source: 'official-minutes', subjects });

const claims = (lines: CheckLine[]) => lines
    .filter((l): l is Extract<CheckLine, { kind: 'claim' }> => l.kind === 'claim')
    .map(l => ({ claim: l.claim, outcome: l.outcome, expect: l.expect }));

describe('checkMeeting, a subject the minutes miss', () => {
    it('keeps the per-claim expectations of the subject', () => {
        const lines = checkMeeting(meeting({
            '7': { outcome: 'majority', against: ['Βήτα Βασίλης'], decisionNumber: '31', expect: { outcome: 'missing', against: 'disagree' } },
        }), data());
        expect(claims(lines)).toEqual([
            { claim: 'subject 7 outcome', outcome: 'missing', expect: 'missing' },
            { claim: 'subject 7 against', outcome: 'missing', expect: 'disagree' },
            { claim: 'subject 7 decisionNumber', outcome: 'missing', expect: 'agree' },
        ]);
    });

    it('gives every claim the one expectation a subject states for all of them', () => {
        const lines = checkMeeting(meeting({ '7': { outcome: 'unanimous', present: ['Άλφα Άννα'], expect: 'missing' } }), data());
        expect(claims(lines)).toEqual([
            { claim: 'subject 7 outcome', outcome: 'missing', expect: 'missing' },
            { claim: 'subject 7 present', outcome: 'missing', expect: 'missing' },
        ]);
    });

    it('records a subject that makes no claim as one missing line', () => {
        expect(claims(checkMeeting(meeting({ '7': {} }), data())))
            .toEqual([{ claim: 'subject 7', outcome: 'missing', expect: 'agree' }]);
    });
});
