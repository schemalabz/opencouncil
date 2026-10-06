/** @jest-environment node */

/**
 * PUT of a meeting: an absent body leaves the meeting where it is, and a body
 * admin may move a meeting only to a body they administer (#828).
 */
const mockWithUserAuthorizedToEdit = jest.fn();
const mockGetCouncilMeetingDirect = jest.fn();
const mockUpdateMeetingWithEffects = jest.fn();

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
}));
jest.mock('@/lib/db/meetings', () => ({
    getCouncilMeetingDirect: (...args: unknown[]) => mockGetCouncilMeetingDirect(...args),
}));
jest.mock('@/lib/meetingWrites', () => ({
    updateMeetingWithEffects: (...args: unknown[]) => mockUpdateMeetingWithEffects(...args),
}));
jest.mock('@/lib/getMeetingData', () => ({ getMeetingDataCore: jest.fn() }));

import { PUT } from '../route';
import { ForbiddenError } from '@/lib/api/errors';

const CITY = 'chania';
const MEETING = 'nov5_2026';
const props = { params: Promise.resolve({ cityId: CITY, meetingId: MEETING }) };
const EDIT = { name: 'Youth meeting', name_en: 'Youth meeting', date: '2026-11-05T18:00:00.000Z' };

function request(body: unknown) {
    return { json: async () => body } as never;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    mockGetCouncilMeetingDirect.mockResolvedValue({ administrativeBodyId: 'youth' });
    mockUpdateMeetingWithEffects.mockResolvedValue({ id: MEETING });
});

describe('PUT /api/cities/{cityId}/meetings/{meetingId}', () => {
    it('leaves the body as it is when the request omits it', async () => {
        const res = await PUT(request(EDIT), props);

        expect(res.status).toBe(200);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledTimes(1);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY, councilMeetingId: MEETING });
        expect(mockUpdateMeetingWithEffects.mock.calls[0][2]).not.toHaveProperty('administrativeBodyId');
    });

    it('asks for no more rights when the request repeats the current body', async () => {
        const res = await PUT(request({ ...EDIT, administrativeBodyId: 'youth' }), props);

        expect(res.status).toBe(200);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledTimes(1);
        expect(mockUpdateMeetingWithEffects.mock.calls[0][2]).toMatchObject({ administrativeBodyId: 'youth' });
    });

    it('asks for the destination body on a move', async () => {
        await PUT(request({ ...EDIT, administrativeBodyId: 'culture' }), props);

        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY, administrativeBodyId: 'culture' });
        expect(mockUpdateMeetingWithEffects.mock.calls[0][2]).toMatchObject({ administrativeBodyId: 'culture' });
    });

    it('asks for the city to clear the body, with null or an empty string', async () => {
        for (const administrativeBodyId of [null, '']) {
            jest.clearAllMocks();
            mockWithUserAuthorizedToEdit.mockResolvedValue(true);
            mockGetCouncilMeetingDirect.mockResolvedValue({ administrativeBodyId: 'youth' });

            await PUT(request({ ...EDIT, administrativeBodyId }), props);

            expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY });
            expect(mockUpdateMeetingWithEffects.mock.calls[0][2]).toMatchObject({ administrativeBodyId: null });
        }
    });

    it('returns 404 for a meeting that does not exist, with or without a body', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(null);

        for (const body of [EDIT, { ...EDIT, administrativeBodyId: 'youth' }]) {
            const res = await PUT(request(body), props);
            expect(res.status).toBe(404);
        }
        expect(mockUpdateMeetingWithEffects).not.toHaveBeenCalled();
    });

    it('writes nothing when the caller may not take the meeting to the destination', async () => {
        mockWithUserAuthorizedToEdit
            .mockResolvedValueOnce(true)
            .mockRejectedValueOnce(new ForbiddenError('Not authorized'));

        const res = await PUT(request({ ...EDIT, administrativeBodyId: 'culture' }), props);

        expect(res.status).toBe(403);
        expect(mockUpdateMeetingWithEffects).not.toHaveBeenCalled();
    });
});
