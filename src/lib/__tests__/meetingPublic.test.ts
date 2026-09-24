import { effectivePlace, hidePostponedFrom, toPublicApiMeeting } from '../meetingPublic';

const row = {
    id: 'b',
    cityId: 'c1',
    name: null,
    name_en: null,
    kind: 'regular' as const,
    dateTime: new Date('2026-03-19T16:00:00Z'),
    released: true,
    place: null,
    postponedFromId: 'mar12_2026',
    administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', place: 'Δημαρχείο Χανίων' },
};

describe('public meeting projections', () => {
    it('gives the API the display names, the place and the original date, and never the id of the postponed meeting', () => {
        const payload = toPublicApiMeeting(row, { timezone: 'Europe/Athens', postponedFromDate: new Date('2026-03-12T16:00:00Z') });
        expect(payload).toMatchObject({
            name: 'Δημοτικό Συμβούλιο 19/03/2026',
            name_en: 'Municipal Council 19/03/2026',
            place: 'Δημαρχείο Χανίων',
            postponedFromDate: '2026-03-12T16:00:00.000Z',
        });
        expect(payload).not.toHaveProperty('postponedFromId');
        expect(JSON.stringify(payload)).not.toContain('mar12_2026');
    });

    it('keeps the shape of a page row and clears the link', () => {
        expect(hidePostponedFrom(row)).toEqual({ ...row, postponedFromId: null });
    });

    it('prefers the place of the meeting over the hall of its body', () => {
        expect(effectivePlace({ ...row, place: 'Πολιτιστικό Κέντρο' })).toBe('Πολιτιστικό Κέντρο');
        expect(effectivePlace({ place: null, administrativeBody: null })).toBeNull();
    });
});
