import {
    administrativeBodyContactsSchema,
    administrativeBodyFormSchema,
    administrativeBodySchema,
    documentSendCardSchema,
    documentSendCardsFromSettings,
    documentSendSettingsFromCards,
    type DocumentSendCard,
} from '../administrativeBody';

const validBody = { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' };

describe('administrativeBodySchema', () => {
    it('splits the comma-separated Diavgeia units', () => {
        const parsed = administrativeBodySchema.parse({ ...validBody, diavgeiaUnitIds: ' 81689, 84655:100010590 ,' });
        expect(parsed.diavgeiaUnitIds).toEqual(['81689', '84655:100010590']);
    });

    it('reads an empty YouTube URL and empty Diavgeia units as a clear, and absent ones as absent', () => {
        const cleared = administrativeBodySchema.parse({ ...validBody, youtubeChannelUrl: '', diavgeiaUnitIds: '' });
        expect(cleared.youtubeChannelUrl).toBeNull();
        expect(cleared.diavgeiaUnitIds).toEqual([]);
        const absent = administrativeBodySchema.parse(validBody);
        expect(absent.youtubeChannelUrl).toBeUndefined();
        expect(absent.diavgeiaUnitIds).toBeUndefined();
    });

    it.each([
        'https://www.youtube.com/@cityofathens',
        'https://www.youtube.com/channel/UCX5CxaBSCrAJxQawnE1sKHw',
        'https://www.youtube.com/user/cityofathens',
    ])('accepts the channel URL %s', (url) => {
        expect(administrativeBodySchema.safeParse({ ...validBody, youtubeChannelUrl: url }).success).toBe(true);
    });

    it.each([
        'https://www.youtube.com/c/CityOfAthens',
        'https://www.youtube.com/playlist?list=PLKlqe7zT3Sf9EYUPBx_AkVe7PJp1yEDjJ',
        'https://www.youtube.com/results?search_query=council',
        'https://example.com/@cityofathens',
    ])('rejects the URL %s, which names no channel', (url) => {
        expect(administrativeBodySchema.safeParse({ ...validBody, youtubeChannelUrl: url }).success).toBe(false);
    });

    it('trims the place and clears it when empty', () => {
        expect(administrativeBodySchema.parse({ ...validBody, place: '  Αίθουσα Δημοτικού Συμβουλίου ' }).place).toBe('Αίθουσα Δημοτικού Συμβουλίου');
        expect(administrativeBodySchema.parse({ ...validBody, place: '' }).place).toBeNull();
        expect(administrativeBodySchema.parse(validBody).place).toBeUndefined();
    });
});

describe('administrativeBodyFormSchema', () => {
    const validForm = { ...validBody, notificationBehavior: 'NOTIFICATIONS_APPROVAL', showUnreviewedTranscript: true, decisionConventions: null };

    const cards = { transcript: { enabled: false, to: '', cc: '' }, minutes: { enabled: false, to: '', cc: '' } };

    it('accepts a form without the optional fields', () => {
        expect(administrativeBodyFormSchema.safeParse({ ...validForm, documentSendSettings: cards }).success).toBe(true);
    });

    it('needs a card per document', () => {
        expect(administrativeBodyFormSchema.safeParse(validForm).success).toBe(false);
    });
});

describe('document send settings', () => {
    const validBody = { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' };

    it('accepts a body without the settings, which leaves them as they are', () => {
        expect(administrativeBodySchema.parse(validBody).documentSendSettings).toBeUndefined();
    });

    it('requires a recipient for a document that is switched on', () => {
        const on = (recipientEmails: string[]) => administrativeBodySchema.safeParse({
            ...validBody,
            documentSendSettings: [{ document: 'minutes', enabled: true, recipientEmails }],
        }).success;
        expect(on([])).toBe(false);
        expect(on(['clerk@example.org'])).toBe(true);
    });

    it('accepts a document that is switched off with no recipient, and rejects a bad address', () => {
        const parse = (setting: unknown) => administrativeBodySchema.safeParse({ ...validBody, documentSendSettings: [setting] }).success;
        expect(parse({ document: 'transcript', enabled: false, recipientEmails: [] })).toBe(true);
        expect(parse({ document: 'transcript', enabled: false, recipientEmails: ['nope'] })).toBe(false);
        expect(parse({ document: 'agenda', enabled: false, recipientEmails: [] })).toBe(false);
    });

    describe('the cards of the form', () => {
        const card = (overrides: Partial<DocumentSendCard>): DocumentSendCard => ({ enabled: false, to: '', cc: '', ...overrides });
        const issues = (c: DocumentSendCard) => {
            const result = documentSendCardSchema.safeParse(c);
            return result.success ? [] : result.error.issues.map(issue => issue.path.join('.'));
        };

        it('needs a To address only when the document is on', () => {
            expect(issues(card({ enabled: true }))).toEqual(['to']);
            expect(issues(card({ enabled: false }))).toEqual([]);
            expect(issues(card({ enabled: true, to: 'clerk@example.org' }))).toEqual([]);
        });

        it('checks every typed address, on or off', () => {
            expect(issues(card({ to: 'nope' }))).toEqual(['to']);
            expect(issues(card({ cc: 'a@example.org, nope' }))).toEqual(['cc']);
            expect(issues(card({ cc: 'a@example.org, b@example.org' }))).toEqual([]);
        });

        it('round-trips the stored settings through the cards', () => {
            const stored = [
                { document: 'transcript' as const, enabled: true, enabledAt: null, recipientEmails: ['to@example.org', 'cc1@example.org', 'cc2@example.org'] },
            ];
            const cards = documentSendCardsFromSettings(stored);
            expect(cards).toEqual({
                transcript: { enabled: true, to: 'to@example.org', cc: 'cc1@example.org, cc2@example.org' },
                minutes: { enabled: false, to: '', cc: '' },
            });
            expect(documentSendSettingsFromCards(cards)).toEqual([
                { document: 'transcript', enabled: true, recipientEmails: ['to@example.org', 'cc1@example.org', 'cc2@example.org'] },
                { document: 'minutes', enabled: false, recipientEmails: [] },
            ]);
        });
    });
});

// The body admin's schema (#828) takes the channel rule of the city admin's:
// pollLivestreams can use only a URL that names a channel.
describe('administrativeBodyContactsSchema', () => {
    it('accepts a channel URL', () => {
        expect(administrativeBodyContactsSchema.parse({ youtubeChannelUrl: 'https://www.youtube.com/@cityofathens' }).youtubeChannelUrl)
            .toBe('https://www.youtube.com/@cityofathens');
    });

    it('rejects a URL that names no channel', () => {
        expect(administrativeBodyContactsSchema.safeParse({ youtubeChannelUrl: 'https://evil.example/login' }).success).toBe(false);
    });

    it.each([['', null], [null, null], [undefined, undefined]])('maps %s to %s', (value, expected) => {
        expect(administrativeBodyContactsSchema.parse({ youtubeChannelUrl: value }).youtubeChannelUrl).toBe(expected);
    });
});
