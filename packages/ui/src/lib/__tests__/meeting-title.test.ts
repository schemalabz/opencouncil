import { MEETING_KINDS, asMeetingKind, meetingKindTitle, meetingTitle, type MeetingKindName } from '../meeting-title';

const date = () => '12/03/2026';

describe('meetingKindTitle', () => {
    it('is the session number and the kind', () => {
        expect(meetingKindTitle('ordinary', 3, 'el')).toBe('3η Τακτική');
        expect(meetingKindTitle('ordinary', 3, 'en')).toBe('3rd Regular');
        expect(meetingKindTitle('accountability', 4, 'el')).toBe('4η Ειδική Λογοδοσίας');
    });

    it('names the kind in full when the meeting has no number', () => {
        expect(meetingKindTitle('ordinary', null, 'el')).toBe('Τακτική Συνεδρίαση');
        expect(meetingKindTitle('ordinary', null, 'en')).toBe('Regular Meeting');
        expect(meetingKindTitle('accountability', null, 'el')).toBe('Ειδική Συνεδρίαση Λογοδοσίας');
        expect(meetingKindTitle('accountability', undefined, 'en')).toBe('Special Accountability Meeting');
    });

    it('has a title for every kind in Greek and English', () => {
        for (const kind of MEETING_KINDS) {
            for (const locale of ['el', 'en']) {
                expect(meetingKindTitle(kind, null, locale)).toMatch(/\S/);
                expect(meetingKindTitle(kind, 1, locale)).toMatch(/^1/);
            }
        }
    });

    it('names the special kinds', () => {
        expect(meetingKindTitle('special', 5, 'el')).toBe('5η Ειδική');
        expect(meetingKindTitle('special', null, 'en')).toBe('Special Meeting');
        expect(meetingKindTitle('financialAccounts', 2, 'el')).toBe('2η Ειδική Οικονομικών Καταστάσεων');
        expect(meetingKindTitle('budget', 1, 'en')).toBe('1st Special Budget');
        expect(meetingKindTitle('budget', null, 'en')).toBe('Special Budget Meeting');
    });

    it('writes an urgent ordinary meeting as «Έκτακτη» alone', () => {
        expect(meetingKindTitle('ordinary', 2, 'el', true)).toBe('2η Έκτακτη');
        expect(meetingKindTitle('ordinary', null, 'el', true)).toBe('Έκτακτη Συνεδρίαση');
        expect(meetingKindTitle('ordinary', 2, 'en', true)).toBe('2nd Urgent');
        expect(meetingKindTitle('ordinary', null, 'en', true)).toBe('Urgent Meeting');
    });

    it('puts the urgency before the words of any other kind', () => {
        expect(meetingKindTitle('budget', null, 'el', true)).toBe('Έκτακτη Ειδική Προϋπολογισμού');
        expect(meetingKindTitle('budget', 2, 'el', true)).toBe('2η Έκτακτη Ειδική Προϋπολογισμού');
        expect(meetingKindTitle('special', 4, 'el', true)).toBe('4η Έκτακτη Ειδική');
        expect(meetingKindTitle('budget', null, 'en', true)).toBe('Urgent Special Budget');
        expect(meetingKindTitle('budget', 2, 'en', true)).toBe('2nd Urgent Special Budget');
    });

    it('never uses the legal word «Κατεπείγουσα»', () => {
        for (const kind of MEETING_KINDS) {
            expect(meetingKindTitle(kind, null, 'el', true)).not.toMatch(/Κατεπείγουσα/);
            expect(meetingKindTitle(kind, 3, 'el', true)).not.toMatch(/Κατεπείγουσα/);
        }
    });

    it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [111, '111th'], [101, '101st']])(
        'writes the English ordinal of %i as %s',
        (n, expected) => {
            expect(meetingKindTitle('ordinary', n, 'en')).toBe(`${expected} Regular`);
        },
    );

    it('is null for an unknown kind and for a locale without kind words', () => {
        expect(meetingKindTitle(null, 3, 'el')).toBeNull();
        expect(meetingKindTitle(null, 3, 'el', true)).toBeNull();
        expect(meetingKindTitle('ordinary', 3, 'fr')).toBeNull();
    });
});

describe('meetingTitle', () => {
    const facts = (kind: MeetingKindName | null, sessionNumber: number | null, storedName: string | null = null, urgent = false) =>
        ({ storedName, kind, sessionNumber, urgent });

    it('reads the word for "meeting" and the date for an unknown kind', () => {
        expect(meetingTitle(facts(null, 3), 'el', date)).toEqual({ text: 'Συνεδρίαση 12/03/2026', dated: true, wholeLabel: false });
        expect(meetingTitle(facts(null, null), 'en', date)).toEqual({ text: 'Meeting 12/03/2026', dated: true, wholeLabel: false });
        expect(meetingTitle(facts('ordinary', 2, null, true), 'fr', date).text).toBe('Séance 12/03/2026');
        expect(meetingTitle(facts('ordinary', null), 'sr', () => '12.03.2026.').text).toBe('Седница 12.03.2026.');
    });

    it('carries no date for a known kind', () => {
        expect(meetingTitle(facts('ordinary', 3), 'el', date)).toEqual({ text: '3η Τακτική', dated: false, wholeLabel: false });
        expect(meetingTitle(facts('ordinary', 2, null, true), 'el', date)).toEqual({ text: '2η Έκτακτη', dated: false, wholeLabel: false });
    });

    it('ignores the number and the urgency of a meeting with no kind', () => {
        expect(meetingTitle(facts(null, 2, null, true), 'el', date)).toEqual({ text: 'Συνεδρίαση 12/03/2026', dated: true, wholeLabel: false });
        expect(meetingTitle(facts(null, 2, null, true), 'en', date)).toEqual({ text: 'Meeting 12/03/2026', dated: true, wholeLabel: false });
    });

    it('reads an ordinary meeting when the urgency is left out', () => {
        expect(meetingTitle({ storedName: null, kind: 'ordinary', sessionNumber: 3 }, 'el', date).text).toBe('3η Τακτική');
    });

    it('lets a kind beat a stored name', () => {
        expect(meetingTitle(facts('accountability', null, 'Ειδική Συνεδρίαση Λογοδοσίας 25/06/26'), 'el', date))
            .toEqual({ text: 'Ειδική Συνεδρίαση Λογοδοσίας', dated: false, wholeLabel: false });
        expect(meetingTitle(facts('ordinary', 3, 'City Council 12/03/26'), 'en', date))
            .toEqual({ text: '3rd Regular', dated: false, wholeLabel: false });
        // A locale without kind words still ignores the stored name.
        expect(meetingTitle(facts('ordinary', 3, 'Conseil municipal'), 'fr', date).text).toBe('Séance 12/03/2026');
    });

    it('falls back to the stored name of a meeting without a kind, as the whole label', () => {
        expect(meetingTitle(facts(null, 3, 'Δημοτικό Συμβούλιο 12/03/26'), 'el', date))
            .toEqual({ text: 'Δημοτικό Συμβούλιο 12/03/26', dated: false, wholeLabel: true });
        expect(meetingTitle(facts(null, null, 'City Council 12/03/26'), 'en', date))
            .toEqual({ text: 'City Council 12/03/26', dated: false, wholeLabel: true });
        expect(meetingTitle(facts(null, null, ''), 'el', date).text).toBe('Συνεδρίαση 12/03/2026');
    });
});

describe('asMeetingKind', () => {
    it('reads a known kind and rejects anything else', () => {
        expect(asMeetingKind('budget')).toBe('budget');
        expect(asMeetingKind('extraordinary')).toBeNull();
        expect(asMeetingKind(null)).toBeNull();
    });
});
