import { administrativeBodyContactsSchema, administrativeBodyFormSchema, administrativeBodySchema } from '../administrativeBody';

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

    it('accepts a form without the optional fields', () => {
        expect(administrativeBodyFormSchema.safeParse(validForm).success).toBe(true);
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
