import { meetingDisplayName, type MeetingNameFields } from '../meetingName';

const ATHENS = 'Europe/Athens';
const council = { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' };

function meeting(overrides: Partial<MeetingNameFields> = {}): MeetingNameFields {
    return {
        name: null,
        name_en: null,
        kind: 'regular',
        dateTime: new Date('2026-03-12T16:00:00Z'),
        administrativeBody: council,
        ...overrides,
    };
}

describe('meetingDisplayName', () => {
    it('builds the name from the body and the date, with no kind word for a regular meeting', () => {
        expect(meetingDisplayName(meeting(), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο 12/03/2026');
        expect(meetingDisplayName(meeting(), 'en', ATHENS)).toBe('Municipal Council 12/03/2026');
    });

    it('prints a meeting of unknown kind like a regular one', () => {
        expect(meetingDisplayName(meeting({ kind: null }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο 12/03/2026');
    });

    it('uses the date of the city, not the UTC date', () => {
        // 23:30 in Athens on 11 March is 21:30 UTC; 00:30 on 12 March is 22:30 UTC on the 11th.
        const late = meeting({ dateTime: new Date('2026-03-11T22:30:00Z') });
        expect(meetingDisplayName(late, 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο 12/03/2026');
    });

    it.each([
        ['urgent', 'Δημοτικό Συμβούλιο — Έκτακτη Συνεδρίαση 12/03/2026', 'Municipal Council — Urgent Meeting 12/03/2026'],
        ['accountability', 'Δημοτικό Συμβούλιο — Ειδική Συνεδρίαση Λογοδοσίας 12/03/2026', 'Municipal Council — Special Meeting (Accountability) 12/03/2026'],
        ['annualReport', 'Δημοτικό Συμβούλιο — Ειδική Συνεδρίαση Απολογισμού 12/03/2026', 'Municipal Council — Special Meeting (Annual Report) 12/03/2026'],
        ['budget', 'Δημοτικό Συμβούλιο — Ειδική Συνεδρίαση Προϋπολογισμού 12/03/2026', 'Municipal Council — Special Meeting (Budget) 12/03/2026'],
        ['presidencyElection', 'Δημοτικό Συμβούλιο — Ειδική Συνεδρίαση Εκλογής Προεδρείου 12/03/2026', 'Municipal Council — Special Meeting (Presidency Election) 12/03/2026'],
    ] as const)('names the %s kind with the words that municipalities print', (kind, el, en) => {
        expect(meetingDisplayName(meeting({ kind }), 'el', ATHENS)).toBe(el);
        expect(meetingDisplayName(meeting({ kind }), 'en', ATHENS)).toBe(en);
    });

    it('never says «Κατεπείγουσα»', () => {
        expect(meetingDisplayName(meeting({ kind: 'urgent' }), 'el', ATHENS)).not.toMatch(/Κατεπείγουσα/);
    });

    it('returns the override as it is', () => {
        const combined = meeting({
            name: 'Ειδική Συνεδρίαση Λογοδοσίας και Τακτική Συνεδρίαση 29/08/25',
            name_en: 'Accountability and Regular Meeting 29/08/25',
            kind: null,
        });
        expect(meetingDisplayName(combined, 'el', ATHENS)).toBe('Ειδική Συνεδρίαση Λογοδοσίας και Τακτική Συνεδρίαση 29/08/25');
        expect(meetingDisplayName(combined, 'en', ATHENS)).toBe('Accountability and Regular Meeting 29/08/25');
    });

    it('derives the English name when only the Greek override is set', () => {
        const greekOnly = meeting({ name: 'Κοινή Συνεδρίαση', name_en: null });
        expect(meetingDisplayName(greekOnly, 'el', ATHENS)).toBe('Κοινή Συνεδρίαση');
        expect(meetingDisplayName(greekOnly, 'en', ATHENS)).toBe('Municipal Council 12/03/2026');
    });

    it('names a meeting that has no administrative body', () => {
        expect(meetingDisplayName(meeting({ administrativeBody: null }), 'el', ATHENS)).toBe('Συνεδρίαση 12/03/2026');
        expect(meetingDisplayName(meeting({ administrativeBody: null }), 'en', ATHENS)).toBe('Meeting 12/03/2026');
    });

    it('prints the body and the date with no Greek kind word in the other locales', () => {
        const rennes = meeting({
            kind: 'urgent',
            administrativeBody: { name: 'Conseil municipal', name_en: 'City Council' },
            dateTime: new Date('2026-03-12T17:00:00Z'),
        });
        expect(meetingDisplayName(rennes, 'fr', 'Europe/Paris')).toBe('Conseil municipal 12/03/2026');
    });

    it('accepts the date as a string, as a serialized payload carries it', () => {
        expect(meetingDisplayName(meeting({ dateTime: '2026-03-12T16:00:00.000Z' }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο 12/03/2026');
    });
});
