import { isDerivedName, meetingDatedLabel, meetingDisplayName, meetingLabel, type MeetingNameFields } from '../meetingName';

const ATHENS = 'Europe/Athens';
const council = { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' };

function meeting(overrides: Partial<MeetingNameFields> = {}): MeetingNameFields {
    return {
        name: null,
        name_en: null,
        kind: 'regular',
        sessionNumber: null,
        dateTime: new Date('2026-03-12T16:00:00Z'),
        administrativeBody: council,
        ...overrides,
    };
}

describe('meetingDisplayName', () => {
    // The kind words and the ordinals are tested with the shared module
    // (packages/ui/src/lib/__tests__/meeting-title.test.ts).
    it('is the session number and the kind, with no body and no date', () => {
        expect(meetingDisplayName(meeting({ sessionNumber: 3 }), 'el', ATHENS)).toBe('3η Τακτική');
        expect(meetingDisplayName(meeting(), 'en', ATHENS)).toBe('Regular Meeting');
    });

    it('reads «Συνεδρίαση» and the date for a meeting of unknown kind', () => {
        expect(meetingDisplayName(meeting({ kind: null, sessionNumber: 3 }), 'el', ATHENS)).toBe('Συνεδρίαση 12/03/2026');
        expect(meetingDisplayName(meeting({ kind: null }), 'en', ATHENS)).toBe('Meeting 12/03/2026');
    });

    it('uses the date of the city, not the UTC date', () => {
        // 00:30 on 12 March in Athens is 22:30 UTC on the 11th.
        const late = meeting({ kind: null, dateTime: new Date('2026-03-11T22:30:00Z') });
        expect(meetingDisplayName(late, 'el', ATHENS)).toBe('Συνεδρίαση 12/03/2026');
    });

    it('names a meeting by the word and the date in the locales without kind words', () => {
        const rennes = meeting({ kind: 'urgent', sessionNumber: 2, dateTime: new Date('2026-03-12T17:00:00Z') });
        expect(meetingDisplayName(rennes, 'fr', 'Europe/Paris')).toBe('Séance 12/03/2026');
        const belgrade = meeting({ dateTime: new Date('2026-03-12T17:00:00Z') });
        expect(meetingDisplayName(belgrade, 'sr', 'Europe/Belgrade')).toBe('Седница 12.03.2026.');
        expect(meetingDisplayName(belgrade, 'sr-Latn', 'Europe/Belgrade')).toBe('Sednica 12.03.2026.');
    });

    it('lets an override win, as the admin wrote it', () => {
        const special = meeting({ name: 'Κοινή Συνεδρίαση', name_en: 'Joint Meeting', sessionNumber: 3 });
        expect(meetingDisplayName(special, 'el', ATHENS)).toBe('Κοινή Συνεδρίαση');
        expect(meetingDisplayName(special, 'en', ATHENS)).toBe('Joint Meeting');
        // A Greek override with no English form: English derives its title.
        expect(meetingDisplayName(meeting({ name: 'Κοινή Συνεδρίαση' }), 'en', ATHENS)).toBe('Regular Meeting');
    });

    it('accepts the date as a string, as a serialized payload carries it', () => {
        expect(meetingDisplayName(meeting({ kind: null, dateTime: '2026-03-12T16:00:00.000Z' }), 'el', ATHENS)).toBe('Συνεδρίαση 12/03/2026');
    });
});

describe('meetingLabel', () => {
    it('puts the body and the date next to the title', () => {
        expect(meetingLabel(meeting({ sessionNumber: 3 }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026');
        expect(meetingLabel(meeting({ sessionNumber: 3 }), 'en', ATHENS)).toBe('Municipal Council · 3rd Regular · 12/03/2026');
    });

    it('prints the date once when the title already carries it', () => {
        expect(meetingLabel(meeting({ kind: null }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026');
    });

    it('leaves the date out on request, unless the title carries it', () => {
        expect(meetingLabel(meeting({ sessionNumber: 3 }), 'el', ATHENS, { date: false })).toBe('Δημοτικό Συμβούλιο · 3η Τακτική');
        expect(meetingLabel(meeting({ kind: null }), 'el', ATHENS, { date: false })).toBe('Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026');
    });

    it('names a meeting with no body by its title and date', () => {
        expect(meetingLabel(meeting({ administrativeBody: null, sessionNumber: 3 }), 'el', ATHENS)).toBe('3η Τακτική · 12/03/2026');
    });

    it('keeps an override as the admin wrote it', () => {
        expect(meetingLabel(meeting({ name: '[Διεκόπη] Δημοτικό Συμβούλιο 20/04/26' }), 'el', ATHENS)).toBe('[Διεκόπη] Δημοτικό Συμβούλιο 20/04/26');
    });
});

describe('isDerivedName', () => {
    const regular = meeting({ kind: 'regular', sessionNumber: 3 });

    it('recognises the label and the title of the meeting as it is', () => {
        expect(isDerivedName('Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026', regular, 'el', ATHENS)).toBe(true);
        expect(isDerivedName('Δημοτικό Συμβούλιο · 3η Τακτική', regular, 'el', ATHENS)).toBe(true);
        expect(isDerivedName(' 3η Τακτική ', regular, 'el', ATHENS)).toBe(true);
        expect(isDerivedName('Municipal Council · 3rd Regular · 12/03/2026', regular, 'en', ATHENS)).toBe(true);
    });

    it('ignores the override that the meeting holds, and keeps a special name', () => {
        const named = { ...regular, name: 'Ειδική για το Λιμάνι' };
        expect(isDerivedName('3η Τακτική', named, 'el', ATHENS)).toBe(true);
        expect(isDerivedName('Ειδική για το Λιμάνι', named, 'el', ATHENS)).toBe(false);
        expect(isDerivedName('Δημοτικό Συμβούλιο · 3η Τακτική · 19/03/2026', regular, 'el', ATHENS)).toBe(false);
    });
});

describe('meetingDatedLabel', () => {
    it('prints the date once, also for a null kind and for an override', () => {
        expect(meetingDatedLabel(meeting({ sessionNumber: 3 }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026');
        expect(meetingDatedLabel(meeting({ kind: null }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026');
        expect(meetingDatedLabel(meeting({ name: 'Ειδική για το Λιμάνι' }), 'el', ATHENS)).toBe('Ειδική για το Λιμάνι · 12/03/2026');
        expect(meetingDatedLabel(meeting({ name: 'Δημοτικό Συμβούλιο 12/03/2026' }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο 12/03/2026');
    });
});
