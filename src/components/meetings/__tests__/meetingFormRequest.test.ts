import { meetingIdForRequest } from '../meetingFormRequest';

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
