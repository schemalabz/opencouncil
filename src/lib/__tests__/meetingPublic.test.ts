import { effectivePlace, hideLinks, hideMinutesOutsideScope, toPublicApiMeeting } from '../meetingPublic';

const row = {
    id: 'b',
    cityId: 'c1',
    name: null,
    name_en: null,
    kind: 'ordinary' as const,
    urgent: false,
    dateTime: new Date('2026-03-19T16:00:00Z'),
    released: true,
    sessionNumber: 3,
    scheduleStatus: 'scheduled' as const,
    scheduleStatusReason: null,
    format: 'inPerson' as const,
    closedToPublic: false,
    place: null,
    postponedFromId: 'mar12_2026',
    continuationOfId: 'mar5_2026',
    hiddenByPostponement: false,
    administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', place: 'Δημαρχείο Χανίων' },
};

describe('public meeting projections', () => {
    it('gives the API the labels, the titles, the place and the original date, and never the id of a linked meeting', () => {
        const payload = toPublicApiMeeting(row, { timezone: 'Europe/Athens', postponedFromDate: new Date('2026-03-12T16:00:00Z') });
        expect(payload).toMatchObject({
            name: 'Δημοτικό Συμβούλιο · 3η Τακτική · 19/03/2026',
            name_en: 'Municipal Council · 3rd Regular · 19/03/2026',
            title: '3η Τακτική',
            title_en: '3rd Regular',
            place: 'Δημαρχείο Χανίων',
            postponedFromDate: '2026-03-12T16:00:00.000Z',
        });
        expect(payload).not.toHaveProperty('continuationOfId');
        expect(payload).not.toHaveProperty('hiddenByPostponement');
        expect(payload).toMatchObject({ kind: 'ordinary', urgent: false });
        expect(JSON.stringify(payload)).not.toContain('mar5_2026');
        expect(payload).not.toHaveProperty('postponedFromId');
        expect(JSON.stringify(payload)).not.toContain('mar12_2026');
    });

    it('names an urgent meeting in the label and returns the urgency', () => {
        const payload = toPublicApiMeeting({ ...row, urgent: true }, { timezone: 'Europe/Athens', postponedFromDate: null });
        expect(payload).toMatchObject({ urgent: true, title: '3η Έκτακτη', title_en: '3rd Urgent' });
    });

    it('keeps the shape of a page row and clears the link', () => {
        expect(hideLinks(row)).toEqual({ ...row, postponedFromId: null, continuationOfId: null });
    });

    it('keeps the municipal minutes out of every public payload (#876)', () => {
        const withMinutes = { ...row, municipalMinutesUrl: 'https://example.com/private-minutes.pdf' };

        expect(hideLinks(withMinutes).municipalMinutesUrl).toBeNull();
        const payload = toPublicApiMeeting(withMinutes, { timezone: 'Europe/Athens', postponedFromDate: null });
        expect(payload).not.toHaveProperty('municipalMinutesUrl');
        expect(JSON.stringify(payload)).not.toContain('private-minutes');
        // A row without the column keeps its shape.
        expect(hideLinks(row)).not.toHaveProperty('municipalMinutesUrl');
    });

    it('keeps the municipal minutes on the editor rows of the meetings the caller edits only', () => {
        const rows = [
            { id: 'ours', administrativeBodyId: 'b1', municipalMinutesUrl: 'https://example.com/ours.pdf' },
            { id: 'theirs', administrativeBodyId: 'b2', municipalMinutesUrl: 'https://example.com/theirs.pdf' },
            { id: 'city', administrativeBodyId: null, municipalMinutesUrl: 'https://example.com/city.pdf' },
        ];
        expect(hideMinutesOutsideScope(rows, { all: true })).toEqual(rows);
        expect(hideMinutesOutsideScope(rows, { all: false, bodyIds: ['b1'] }).map(row => row.municipalMinutesUrl))
            .toEqual(['https://example.com/ours.pdf', null, null]);
    });

    it('prefers the place of the meeting over the hall of its body', () => {
        expect(effectivePlace({ ...row, place: 'Πολιτιστικό Κέντρο' })).toBe('Πολιτιστικό Κέντρο');
        expect(effectivePlace({ ...row, place: null })).toBe(row.administrativeBody.place);
        expect(effectivePlace({ format: 'inPerson', place: null, administrativeBody: null })).toBeNull();
    });

    it('gives a meeting no place when its format has none', () => {
        expect(effectivePlace({ ...row, format: 'remote' })).toBeNull();
        expect(effectivePlace({ ...row, format: 'hybrid' })).toBe(row.administrativeBody.place);
    });

    it('gives a meeting of unstated format its own place, else the hall of its body', () => {
        expect(effectivePlace({ ...row, format: null })).toBe(row.administrativeBody.place);
        expect(effectivePlace({ ...row, format: null, place: 'Πολιτιστικό Κέντρο' })).toBe('Πολιτιστικό Κέντρο');
    });
});
