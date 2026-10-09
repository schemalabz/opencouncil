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

// The values are the output of meetingFormSchema: an empty reason or place is
// already null, and a typed one is trimmed.
describe('meetingRequestFields', () => {
    const base = {
        kind: 'ordinary' as const,
        urgent: false,
        scheduleStatus: 'scheduled' as const,
        format: 'inPerson' as const,
        closedToPublic: false,
        scheduleStatusReason: null,
        place: null,
        noRecording: false,
    };

    it('clears the optional fields when the inputs are empty, and sends no name', () => {
        expect(meetingRequestFields({ ...base, sessionNumber: '', postponedFromId: 'none' }, { linkChanged: true, greekCodeFacts: true })).toEqual({
            ...base,
            scheduleStatusReason: null,
            sessionNumber: null,
            place: null,
            postponedFromId: null,
        });
    });

    it('sends the typed values, with the number as a number', () => {
        expect(meetingRequestFields({
            ...base, scheduleStatus: 'postponed', scheduleStatusReason: 'Λόγω απεργίας', sessionNumber: '15',
            place: 'Πολιτιστικό Κέντρο', postponedFromId: 'mar12_2026',
        }, { linkChanged: true, greekCodeFacts: true })).toMatchObject({
            scheduleStatus: 'postponed', scheduleStatusReason: 'Λόγω απεργίας', sessionNumber: 15,
            place: 'Πολιτιστικό Κέντρο', postponedFromId: 'mar12_2026',
        });
    });

    it('carries the no-recording switch with the record (#829)', () => {
        expect(meetingRequestFields({ ...base, noRecording: true }, { linkChanged: false, greekCodeFacts: true }).noRecording).toBe(true);
    });

    it('drops the reason of a meeting that is scheduled again', () => {
        expect(meetingRequestFields({ ...base, scheduleStatusReason: 'Λόγω απεργίας' }, { linkChanged: false, greekCodeFacts: true }).scheduleStatusReason).toBeNull();
    });

    it('leaves the link out when the admin did not change it, so a save never removes it', () => {
        // The page payload hides the link: the field shows "none" for a linked meeting.
        expect(meetingRequestFields({ ...base, postponedFromId: 'none' }, { linkChanged: false, greekCodeFacts: true }).postponedFromId).toBeUndefined();
        expect(JSON.stringify(meetingRequestFields({ ...base, postponedFromId: 'none' }, { linkChanged: false, greekCodeFacts: true }))).not.toContain('postponedFromId');
    });

    it('leaves out the kind, the urgency and the session number for a city outside Greece', () => {
        const fields = meetingRequestFields({ ...base, urgent: true, sessionNumber: '3' }, { linkChanged: false, greekCodeFacts: false });
        const sent = JSON.parse(JSON.stringify(fields));
        expect(sent).not.toHaveProperty('kind');
        expect(sent).not.toHaveProperty('urgent');
        expect(sent).not.toHaveProperty('sessionNumber');
        expect(sent).toMatchObject({ scheduleStatus: 'scheduled', format: 'inPerson', closedToPublic: false });
    });

    it('does not send back a format that no form offers', () => {
        expect(meetingRequestFields({ ...base, format: 'byCirculation' }, { linkChanged: false, greekCodeFacts: true }).format).toBeUndefined();
        expect(meetingRequestFields({ ...base, format: 'hybrid' }, { linkChanged: false, greekCodeFacts: true }).format).toBe('hybrid');
    });

    it('sends the urgency with any kind', () => {
        expect(meetingRequestFields({ ...base, urgent: true }, { linkChanged: false, greekCodeFacts: true })).toMatchObject({ kind: 'ordinary', urgent: true });
        expect(meetingRequestFields({ ...base, kind: null, urgent: true }, { linkChanged: false, greekCodeFacts: true })).toMatchObject({ kind: null, urgent: true });
    });

    it('sends an unstated kind and format as null: «Από την πρόσκληση»', () => {
        const fields = meetingRequestFields({ ...base, kind: null, format: null }, { linkChanged: false, greekCodeFacts: true });
        expect(fields.kind).toBeNull();
        expect(fields.format).toBeNull();
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
