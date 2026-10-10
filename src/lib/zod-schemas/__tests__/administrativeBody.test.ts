import { administrativeBodyFormSchema, administrativeBodySchema } from '../administrativeBody';

const validBody = { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' };

describe('administrativeBodySchema', () => {
    it('splits the comma-separated Diavgeia units', () => {
        const parsed = administrativeBodySchema.parse({ ...validBody, diavgeiaUnitIds: ' 81689, 84655:100010590 ,' });
        expect(parsed.diavgeiaUnitIds).toEqual(['81689', '84655:100010590']);
    });

    it('treats an empty YouTube URL as no URL', () => {
        expect(administrativeBodySchema.parse({ ...validBody, youtubeChannelUrl: '' }).youtubeChannelUrl).toBeUndefined();
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

    it('rejects an invalid contact email', () => {
        expect(administrativeBodySchema.safeParse({ ...validBody, contactEmails: ['not-an-email'] }).success).toBe(false);
    });

    it('trims the place and clears it when empty', () => {
        expect(administrativeBodySchema.parse({ ...validBody, place: '  Αίθουσα Δημοτικού Συμβουλίου ' }).place).toBe('Αίθουσα Δημοτικού Συμβουλίου');
        expect(administrativeBodySchema.parse({ ...validBody, place: '' }).place).toBeNull();
        expect(administrativeBodySchema.parse(validBody).place).toBeUndefined();
    });
});

describe('administrativeBodyFormSchema', () => {
    const validForm = { ...validBody, notificationBehavior: 'NOTIFICATIONS_APPROVAL', showUnreviewedTranscript: true, decisionConventions: null };

    it('rejects a CC list with an invalid address', () => {
        expect(administrativeBodyFormSchema.safeParse({ ...validForm, contactEmailsCC: 'a@example.com, nope' }).success).toBe(false);
    });

    it('accepts an empty CC list', () => {
        expect(administrativeBodyFormSchema.safeParse({ ...validForm, contactEmailsCC: '' }).success).toBe(true);
    });
});
