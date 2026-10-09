import { getLocalizedName } from '@/lib/formatters/name';
import { meetingDatedLabel, meetingDisplayName, meetingLabel, type MeetingNameFields } from '../meetingName';

const ATHENS = 'Europe/Athens';
const council = { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' };

function meeting(overrides: Partial<MeetingNameFields> = {}): MeetingNameFields {
    return {
        name: null,
        name_en: null,
        kind: 'ordinary',
        urgent: false,
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
        const rennes = meeting({ kind: 'ordinary', urgent: true, sessionNumber: 2, dateTime: new Date('2026-03-12T17:00:00Z') });
        expect(meetingDisplayName(rennes, 'fr', 'Europe/Paris')).toBe('Séance 12/03/2026');
        const belgrade = meeting({ dateTime: new Date('2026-03-12T17:00:00Z') });
        expect(meetingDisplayName(belgrade, 'sr', 'Europe/Belgrade')).toBe('Седница 12.03.2026.');
        expect(meetingDisplayName(belgrade, 'sr-Latn', 'Europe/Belgrade')).toBe('Sednica 12.03.2026.');
    });

    it('ignores the stored name of a meeting with a kind', () => {
        const stored = meeting({ name: 'Ειδική Συνεδρίαση Λογοδοσίας 25/06/26', name_en: 'Accountability 25/06/26', kind: 'accountability' });
        expect(meetingDisplayName(stored, 'el', ATHENS)).toBe('Ειδική Συνεδρίαση Λογοδοσίας');
        expect(meetingDisplayName(stored, 'en', ATHENS)).toBe('Special Accountability Meeting');
    });

    it('shows the stored name of a meeting without a kind, in the language of the locale', () => {
        const stored = meeting({ kind: null, name: 'Δημοτικό Συμβούλιο 12/03/26', name_en: 'City Council 12/03/26' });
        expect(meetingDisplayName(stored, 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο 12/03/26');
        expect(meetingDisplayName(stored, 'en', ATHENS)).toBe('City Council 12/03/26');
        // No English form: English shows the stored name, as before.
        expect(meetingDisplayName({ ...stored, name_en: null }, 'en', ATHENS)).toBe('Δημοτικό Συμβούλιο 12/03/26');
    });

    it('shows a stored name in the script of a Serbian locale', () => {
        const nis = meeting({ kind: null, name: 'Седница Скупштине', name_en: 'Assembly Session' });
        expect(meetingDisplayName(nis, 'sr', 'Europe/Belgrade')).toBe('Седница Скупштине');
        expect(meetingDisplayName(nis, 'sr-Latn', 'Europe/Belgrade')).toBe('Sednica Skupštine');
    });

    it('names the urgency of the meeting', () => {
        expect(meetingDisplayName(meeting({ urgent: true, sessionNumber: 2 }), 'el', ATHENS)).toBe('2η Έκτακτη');
        expect(meetingDisplayName(meeting({ urgent: true, kind: 'budget' }), 'el', ATHENS)).toBe('Έκτακτη Ειδική Προϋπολογισμού');
        expect(meetingDisplayName(meeting({ urgent: true, kind: 'budget', sessionNumber: 2 }), 'en', ATHENS)).toBe('2nd Urgent Special Budget');
        expect(meetingDisplayName(meeting({ urgent: true, kind: null, sessionNumber: 2 }), 'el', ATHENS)).toBe('Συνεδρίαση 12/03/2026');
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

    it('puts the body and the date next to an urgent title', () => {
        expect(meetingLabel(meeting({ urgent: true, sessionNumber: 2 }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · 2η Έκτακτη · 12/03/2026');
        expect(meetingLabel(meeting({ urgent: true, sessionNumber: 2 }), 'en', ATHENS)).toBe('Municipal Council · 2nd Urgent · 12/03/2026');
    });

    it('names a meeting with no body by its title and date', () => {
        expect(meetingLabel(meeting({ administrativeBody: null, sessionNumber: 3 }), 'el', ATHENS)).toBe('3η Τακτική · 12/03/2026');
    });

    it('is the stored name alone for a meeting without a kind, with no body and no date', () => {
        const stored = meeting({ kind: null, name: '[Διεκόπη] Δημοτικό Συμβούλιο 20/04/26', name_en: '[Interrupted] City Council 20/04/26' });
        expect(meetingLabel(stored, 'el', ATHENS)).toBe('[Διεκόπη] Δημοτικό Συμβούλιο 20/04/26');
        expect(meetingLabel(stored, 'en', ATHENS)).toBe('[Interrupted] City Council 20/04/26');
        expect(meetingLabel(stored, 'el', ATHENS, { date: false })).toBe('[Διεκόπη] Δημοτικό Συμβούλιο 20/04/26');
    });

    it('wraps the derived title of a meeting without a kind or a stored name', () => {
        expect(meetingLabel(meeting({ kind: null }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026');
        expect(meetingLabel(meeting({ kind: null }), 'en', ATHENS)).toBe('Municipal Council · Meeting 12/03/2026');
    });

    it('derives the label of a meeting with a kind, and ignores its stored name', () => {
        const stored = meeting({ kind: 'accountability', sessionNumber: 4, name: 'Ειδική Συνεδρίαση Λογοδοσίας 25/06/26', name_en: 'Accountability 25/06/26' });
        expect(meetingLabel(stored, 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · 4η Ειδική Λογοδοσίας · 12/03/2026');
        expect(meetingLabel(stored, 'en', ATHENS)).toBe('Municipal Council · 4th Special Accountability · 12/03/2026');
    });
});

describe('meetingDatedLabel', () => {
    it('prints the date once, also for a null kind and for a stored name', () => {
        expect(meetingDatedLabel(meeting({ sessionNumber: 3 }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026');
        expect(meetingDatedLabel(meeting({ kind: null }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026');
        expect(meetingDatedLabel(meeting({ kind: null, name: 'Ειδική για το Λιμάνι' }), 'el', ATHENS)).toBe('Ειδική για το Λιμάνι · 12/03/2026');
        expect(meetingDatedLabel(meeting({ kind: null, name: 'Δημοτικό Συμβούλιο 12/03/2026' }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο 12/03/2026');
    });
});

// A city outside Greece has no kind, no urgency and no session number
// (recordsGreekCodeFacts). Its demo meetings keep their stored names, and a
// new meeting reads as the word for "meeting" and the date in the language of the city.
describe('the meetings of a city outside Greece', () => {
    const cities = [
        { city: 'rennes', locale: 'fr', timezone: 'Europe/Paris', dateTime: '2026-04-27T16:00:00Z', title: 'Séance 27/04/2026' },
        { city: 'nis', locale: 'sr', timezone: 'Europe/Belgrade', dateTime: '2026-03-17T16:00:00Z', title: 'Седница 17.03.2026.' },
        { city: 'nis', locale: 'sr-Latn', timezone: 'Europe/Belgrade', dateTime: '2026-03-17T16:00:00Z', title: 'Sednica 17.03.2026.' },
        { city: 'vouli', locale: 'el', timezone: 'Asia/Nicosia', dateTime: '2026-05-20T16:00:00Z', title: 'Συνεδρίαση 20/05/2026' },
    ] as const;

    it.each(cities)('names a new meeting of $city in $locale by the word and the date', ({ locale, timezone, dateTime, title }) => {
        const created = meeting({ kind: null, dateTime: new Date(dateTime), administrativeBody: null });
        expect(meetingDisplayName(created, locale, timezone)).toBe(title);
        expect(meetingLabel(created, locale, timezone)).toBe(title);
        expect(meetingDatedLabel(created, locale, timezone)).toBe(title);
    });

    const demos = [
        { city: 'rennes', locale: 'fr', timezone: 'Europe/Paris', name: 'Conseil municipal du 27 avril 2026', shown: 'Conseil municipal du 27 avril 2026' },
        { city: 'nis', locale: 'sr', timezone: 'Europe/Belgrade', name: 'Седница Скупштине Града Ниша', shown: 'Седница Скупштине Града Ниша' },
        { city: 'nis', locale: 'sr-Latn', timezone: 'Europe/Belgrade', name: 'Седница Скупштине Града Ниша', shown: 'Sednica Skupštine Grada Niša' },
        { city: 'vouli', locale: 'el', timezone: 'Asia/Nicosia', name: 'Συνεδρίαση Ολομέλειας 20/05/2026', shown: 'Συνεδρίαση Ολομέλειας 20/05/2026' },
    ] as const;

    it.each(demos)('keeps the stored name of a demo meeting of $city as the whole label in $locale', ({ locale, timezone, name, shown }) => {
        const demo = meeting({ kind: null, name, name_en: null });
        // What the meeting showed before the name was derived.
        expect(getLocalizedName({ name, name_en: null }, locale)).toBe(shown);
        expect(meetingDisplayName(demo, locale, timezone)).toBe(shown);
        expect(meetingLabel(demo, locale, timezone)).toBe(shown);
    });
});
