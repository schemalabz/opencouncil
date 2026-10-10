import { MEETING_KINDS, asMeetingKind, meetingKindTitle, meetingTitle, type MeetingKindName } from '../meeting-title';

const date = () => '12/03/2026';

describe('meetingKindTitle', () => {
    it('is the session number and the kind', () => {
        expect(meetingKindTitle('regular', 3, 'el')).toBe('3η Τακτική');
        expect(meetingKindTitle('regular', 3, 'en')).toBe('3rd Regular');
        expect(meetingKindTitle('urgent', 2, 'el')).toBe('2η Έκτακτη');
        expect(meetingKindTitle('accountability', 4, 'el')).toBe('4η Ειδική Λογοδοσίας');
    });

    it('names the kind in full when the meeting has no number', () => {
        expect(meetingKindTitle('regular', null, 'el')).toBe('Τακτική Συνεδρίαση');
        expect(meetingKindTitle('regular', null, 'en')).toBe('Regular Meeting');
        expect(meetingKindTitle('accountability', null, 'el')).toBe('Ειδική Συνεδρίαση Λογοδοσίας');
        expect(meetingKindTitle('accountability', undefined, 'en')).toBe('Special Meeting (Accountability)');
    });

    it('has a title for every kind in Greek and English', () => {
        for (const kind of MEETING_KINDS) {
            for (const locale of ['el', 'en']) {
                expect(meetingKindTitle(kind, null, locale)).toMatch(/\S/);
                expect(meetingKindTitle(kind, 1, locale)).toMatch(/^1/);
            }
        }
    });

    it('never uses the legal word «Κατεπείγουσα»', () => {
        expect(meetingKindTitle('urgent', null, 'el')).not.toMatch(/Κατεπείγουσα/);
    });

    it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [111, '111th'], [101, '101st']])(
        'writes the English ordinal of %i as %s',
        (n, expected) => {
            expect(meetingKindTitle('regular', n, 'en')).toBe(`${expected} Regular`);
        },
    );

    it('is null for an unknown kind and for a locale without kind words', () => {
        expect(meetingKindTitle(null, 3, 'el')).toBeNull();
        expect(meetingKindTitle('regular', 3, 'fr')).toBeNull();
    });
});

describe('meetingTitle', () => {
    const facts = (kind: MeetingKindName | null, sessionNumber: number | null, override: string | null = null) => ({ override, kind, sessionNumber });

    it('reads the word for "meeting" and the date for an unknown kind', () => {
        expect(meetingTitle(facts(null, 3), 'el', date)).toEqual({ text: 'Συνεδρίαση 12/03/2026', dated: true });
        expect(meetingTitle(facts(null, null), 'en', date)).toEqual({ text: 'Meeting 12/03/2026', dated: true });
        expect(meetingTitle(facts('urgent', 2), 'fr', date).text).toBe('Séance 12/03/2026');
        expect(meetingTitle(facts('regular', null), 'sr', () => '12.03.2026.').text).toBe('Седница 12.03.2026.');
    });

    it('carries no date for a known kind', () => {
        expect(meetingTitle(facts('regular', 3), 'el', date)).toEqual({ text: '3η Τακτική', dated: false });
    });

    it('lets an override win, and ignores an empty one', () => {
        expect(meetingTitle(facts('regular', 3, 'Κοινή Συνεδρίαση'), 'el', date)).toEqual({ text: 'Κοινή Συνεδρίαση', dated: false });
        expect(meetingTitle(facts('regular', 3, ''), 'el', date).text).toBe('3η Τακτική');
        expect(meetingTitle(facts(null, null, 'Ειδική για το Λιμάνι'), 'el', date).text).toBe('Ειδική για το Λιμάνι');
    });
});

describe('asMeetingKind', () => {
    it('reads a known kind and rejects anything else', () => {
        expect(asMeetingKind('budget')).toBe('budget');
        expect(asMeetingKind('extraordinary')).toBeNull();
        expect(asMeetingKind(null)).toBeNull();
    });
});
