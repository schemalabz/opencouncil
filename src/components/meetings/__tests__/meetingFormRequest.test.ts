import { meetingIdForRequest, meetingRequestFields, postponementCandidatesUrl, POSTPONEMENT_WINDOW_DAYS } from '../meetingFormRequest';

describe('meetingIdForRequest', () => {
    it('sends no id for a new meeting when the admin typed none, so a second meeting on the same day gets _2', () => {
        expect(meetingIdForRequest('', false)).toBeUndefined();
        expect(meetingIdForRequest('   ', false)).toBeUndefined();
        expect(meetingIdForRequest(undefined, false)).toBeUndefined();
    });

    it('sends the id that the admin typed', () => {
        expect(meetingIdForRequest(' mar12_2026_b ', false)).toBe('mar12_2026_b');
    });

    it('sends no id for an edit: the URL names the meeting', () => {
        expect(meetingIdForRequest('mar12_2026', true)).toBeUndefined();
    });
});

describe('meetingRequestFields', () => {
    const base = {
        kind: 'regular' as const,
        scheduleStatus: 'scheduled' as const,
        format: 'inPerson' as const,
        closedToPublic: false,
    };

    it('clears the override and the optional fields when the inputs are empty, so the name is derived', () => {
        expect(meetingRequestFields({ ...base, name: '', name_en: ' ', sessionNumber: '', place: '', postponedFromId: 'none' }, { linkChanged: true })).toEqual({
            ...base,
            name: null,
            name_en: null,
            scheduleStatusReason: null,
            sessionNumber: null,
            place: null,
            postponedFromId: null,
        });
    });

    it('sends the typed values, with the number as a number', () => {
        expect(meetingRequestFields({
            ...base, scheduleStatus: 'postponed', scheduleStatusReason: ' Λόγω απεργίας ', sessionNumber: '15',
            place: 'Πολιτιστικό Κέντρο', postponedFromId: 'mar12_2026', name: 'Κοινή Συνεδρίαση',
        }, { linkChanged: true })).toMatchObject({
            scheduleStatus: 'postponed', scheduleStatusReason: 'Λόγω απεργίας', sessionNumber: 15,
            place: 'Πολιτιστικό Κέντρο', postponedFromId: 'mar12_2026', name: 'Κοινή Συνεδρίαση',
        });
    });

    it('drops the reason of a meeting that is scheduled again', () => {
        expect(meetingRequestFields({ ...base, scheduleStatusReason: 'Λόγω απεργίας' }, { linkChanged: false }).scheduleStatusReason).toBeNull();
    });

    it('leaves the link out when the admin did not change it, so a save never removes it', () => {
        // The page payload hides the link: the field shows "none" for a linked meeting.
        expect(meetingRequestFields({ ...base, postponedFromId: 'none' }, { linkChanged: false }).postponedFromId).toBeUndefined();
        expect(JSON.stringify(meetingRequestFields({ ...base, postponedFromId: 'none' }, { linkChanged: false }))).not.toContain('postponedFromId');
    });

    it('keeps the unknown kind of an archive meeting on an unrelated edit', () => {
        expect(meetingRequestFields({ ...base, kind: null }, { linkChanged: false }).kind).toBeNull();
    });
});

describe('postponementCandidatesUrl', () => {
    const DAY = 24 * 60 * 60 * 1000;

    it('reads the whole window around the given date, with no row limit', () => {
        const around = new Date('2026-03-19T00:00:00Z');
        const url = new URL(postponementCandidatesUrl('chania', around), 'http://localhost');
        expect(url.pathname).toBe('/api/cities/chania/meetings');
        expect(url.searchParams.get('includeUnreleased')).toBe('true');
        expect(url.searchParams.has('limit')).toBe(false);
        expect(new Date(url.searchParams.get('from')!).getTime()).toBe(around.getTime() - POSTPONEMENT_WINDOW_DAYS * DAY);
        expect(new Date(url.searchParams.get('to')!).getTime()).toBe(around.getTime() + POSTPONEMENT_WINDOW_DAYS * DAY);
    });

    it('follows the date of the meeting, not today, so a new meeting on another date finds its candidates', () => {
        const url = new URL(postponementCandidatesUrl('chania', new Date('2025-01-10T00:00:00Z')), 'http://localhost');
        expect(url.searchParams.get('from')!.startsWith('2024-11-11')).toBe(true);
    });
});
