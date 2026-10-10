/** @jest-environment node */
import { administrativeBodySchema } from '@/lib/zod-schemas/administrativeBody';
import { createCityFormDataSchema, updateCityFormDataSchema } from '@/lib/zod-schemas/city';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { partyFormDataSchema } from '@/lib/zod-schemas/party';
import { personFormDataSchema, personFormSchema } from '@/lib/zod-schemas/person';
import { subjectListQuerySchema } from '@/lib/zod-schemas/subject';

// Inputs at the edge of the app: links a person or a model supplies, uploads,
// booleans and dates sent as text.

const UNSAFE_LINKS = ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://example.com/file.pdf'];
// Greek-script domains, in Unicode and in punycode, are real links.
const SAFE_LINKS = ['https://example.com/a?b=1', 'http://example.com/a', 'https://δήμος.ελ/νέα', 'https://xn--hxargifdar.xn--qxam/'];

const person = { name: 'Άννα Αλεξίου', name_en: 'Anna Alexiou', name_short: 'Α. Αλεξίου', name_short_en: 'A. Alexiou' };
const personFormData = { ...person, roles: '[]' };
const meeting = { name: 'Συνεδρίαση', name_en: 'Meeting', date: '2026-10-05T15:00:00.000Z' };
const party = { name: 'Κόμμα', name_en: 'Party', name_short: 'ΚΜ', name_short_en: 'PT', colorHex: '#112233' };
const city = {
    id: 'athens', name: 'Αθήνα', name_en: 'Athens', name_municipality: 'Δήμος Αθηναίων',
    name_municipality_en: 'Municipality of Athens', timezone: 'Europe/Athens', authorityType: 'municipality',
    status: 'pending', highlightCreationPermission: 'ADMINS_ONLY', language: 'el', realm: 'greece',
    supportsNotifications: 'false', consultationsEnabled: 'false',
};
const council = { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' };
const population = (overrides: { logo?: string; image?: string; profileUrl?: string }) => ({
    cityId: 'athens',
    parties: [{ ...party, logo: overrides.logo }],
    administrativeBodies: [council],
    people: [{ ...person, image: overrides.image, profileUrl: overrides.profileUrl }],
});

const png = (bytes = 10) => new File([new Uint8Array(bytes)], 'logo.png', { type: 'image/png' });

describe('user-supplied links accept http(s) only', () => {
    const fields: [string, (link: string) => { success: boolean }][] = [
        ['person form profileUrl', link => personFormSchema.safeParse({ ...person, profileUrl: link })],
        ['person route profileUrl', link => personFormDataSchema.safeParse({ ...personFormData, profileUrl: link })],
        ['meeting youtubeUrl', link => meetingSchema.safeParse({ ...meeting, youtubeUrl: link })],
        ['meeting agendaUrl', link => meetingSchema.safeParse({ ...meeting, agendaUrl: link })],
        ['City Creator party logo', link => cityPopulationSchema.safeParse(population({ logo: link }))],
        ['City Creator person image', link => cityPopulationSchema.safeParse(population({ image: link }))],
        ['City Creator profileUrl', link => cityPopulationSchema.safeParse(population({ profileUrl: link }))],
    ];

    describe.each(fields)('%s', (_, parse) => {
        it.each(UNSAFE_LINKS)('refuses %s', link => expect(parse(link).success).toBe(false));
        it.each(SAFE_LINKS)('takes %s', link => expect(parse(link).success).toBe(true));
        it('takes an empty value, which means no link', () => expect(parse('').success).toBe(true));
    });

    describe('administrative body youtubeChannelUrl', () => {
        const parse = (youtubeChannelUrl: string) => administrativeBodySchema.safeParse({ ...council, youtubeChannelUrl });

        // parseChannelRef reads a value with no slash as a bare handle, so the
        // channel check alone took `javascript:alert(1)`.
        it.each(UNSAFE_LINKS)('refuses %s', link => expect(parse(link).success).toBe(false));
        it.each(['https://www.youtube.com/@dimosathinaion', 'https://www.youtube.com/channel/UC1234567890'])(
            'takes %s', link => expect(parse(link).success).toBe(true));
        it('still refuses a non-YouTube host', () => expect(parse('https://example.com/@handle').success).toBe(false));
    });
});

describe('uploads', () => {
    const MB = 1024 * 1024;

    it('takes a PNG or a JPEG logo, and refuses any other type', () => {
        const create = (logoImage: File) => createCityFormDataSchema.safeParse({ ...city, logoImage });
        expect(create(png()).success).toBe(true);
        expect(create(new File(['x'], 'logo.jpg', { type: 'image/jpeg' })).success).toBe(true);
        expect(create(new File(['x'], 'logo.gif', { type: 'image/gif' })).success).toBe(false);
        expect(create(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })).success).toBe(false);
        expect(updateCityFormDataSchema.safeParse({ logoImage: new File(['x'], 'logo.gif', { type: 'image/gif' }) }).success).toBe(false);
        expect(partyFormDataSchema.safeParse({ ...party, logo: new File(['x'], 'logo.gif', { type: 'image/gif' }) }).success).toBe(false);
        expect(partyFormDataSchema.safeParse({ ...party, logo: png() }).success).toBe(true);
    });

    it('keeps the message of a missing city logo', () => {
        const parsed = createCityFormDataSchema.safeParse(city);
        expect(parsed.error?.issues).toEqual([expect.objectContaining({ path: ['logoImage'], message: 'Logo image is required' })]);
    });

    it('refuses an image or a logo over 5 MB', () => {
        expect(personFormDataSchema.safeParse({ ...personFormData, image: png(5 * MB) }).success).toBe(true);
        expect(personFormDataSchema.safeParse({ ...personFormData, image: png(5 * MB + 1) }).success).toBe(false);
        expect(partyFormDataSchema.safeParse({ ...party, logo: png(5 * MB + 1) }).success).toBe(false);
        expect(createCityFormDataSchema.safeParse({ ...city, logoImage: png(5 * MB + 1) }).success).toBe(false);
    });

    it('refuses a string where a file belongs', () => {
        expect(personFormDataSchema.safeParse({ ...personFormData, image: 'photo.png' }).success).toBe(false);
    });
});

describe('booleans sent as text', () => {
    // Every value the forms send: CityForm sends `bool.toString()`, the
    // person and party forms send 'true' or leave the field out.
    it.each([['true', true], ['false', false]])('reads the city flags %s', (value, expected) => {
        const parsed = createCityFormDataSchema.parse({ ...city, supportsNotifications: value, consultationsEnabled: value, logoImage: png() });
        expect(parsed.supportsNotifications).toBe(expected);
        expect(parsed.consultationsEnabled).toBe(expected);
    });

    it('reads removeImage and removeLogo, and keeps false when the form leaves them out', () => {
        expect(personFormDataSchema.parse({ ...personFormData, removeImage: 'true' }).removeImage).toBe(true);
        expect(personFormDataSchema.parse(personFormData).removeImage).toBe(false);
        expect(partyFormDataSchema.parse({ ...party, removeLogo: 'true' }).removeLogo).toBe(true);
        expect(partyFormDataSchema.parse(party).removeLogo).toBe(false);
    });

    it('refuses a value outside the stringbool lists instead of reading it as false', () => {
        expect(personFormDataSchema.safeParse({ ...personFormData, removeImage: 'maybe' }).success).toBe(false);
    });
});

describe('dates sent as text', () => {
    const accepted: [string, string][] = [
        ['what AddMeetingForm sends (toISOString)', '2026-10-05T15:00:00.000Z'],
        ['a calendar day', '2026-10-05'],
        ['a date-time with an offset', '2026-10-05T18:00:00+03:00'],
        ['a date-time with no zone', '2026-10-05T18:00:00'],
        ['a date-time with no zone and no seconds', '2026-10-05T18:00'],
    ];
    const refused: [string, string][] = [
        ['a day that does not exist', '2026-02-31'],
        ['a space for the T', '2026-10-05 18:00:00'],
        ['an English date', 'October 5, 2026'],
        ['a zoned date-time with no seconds', '2026-10-05T18:00Z'],
    ];

    it.each(accepted)('meetingSchema takes %s', (_, date) => {
        expect(meetingSchema.parse({ ...meeting, date }).date).toEqual(new Date(date));
    });
    it.each(refused)('meetingSchema refuses %s, with its message', (_, date) => {
        expect(meetingSchema.safeParse({ ...meeting, date }).error?.issues)
            .toEqual([expect.objectContaining({ path: ['date'], message: 'Invalid date/time format' })]);
    });

    it.each(accepted)('the subject listing takes %s', (_, from) => {
        expect(subjectListQuerySchema.parse({ from }).from).toEqual(new Date(from));
    });
    it.each(refused)('the subject listing refuses %s, with its message', (_, from) => {
        expect(subjectListQuerySchema.safeParse({ from }).error?.issues)
            .toEqual([expect.objectContaining({ path: ['from'], message: "Invalid 'from' date" })]);
    });
});
