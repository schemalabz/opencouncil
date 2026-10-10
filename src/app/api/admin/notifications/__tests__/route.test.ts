/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/db/notifications', () => ({
    getNotificationsGroupedByMeeting: jest.fn().mockResolvedValue({ meetings: [] }),
    getNotificationsForMeeting: jest.fn().mockResolvedValue([]),
    getCitiesWithNotifications: jest.fn().mockResolvedValue([]),
    deleteNotificationsForMeetings: jest.fn(),
}));

import { GET } from '@/app/api/admin/notifications/route';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getNotificationsGroupedByMeeting } from '@/lib/db/notifications';
import { validationErrorSchema } from '@/lib/api/errors';

const get = (query: string) => GET(new NextRequest(`http://localhost/api/admin/notifications?${query}`));
const grouped = getNotificationsGroupedByMeeting as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    (withUserAuthorizedToEdit as jest.Mock).mockResolvedValue(undefined);
});

describe('GET /api/admin/notifications', () => {
    it('reads the page, the filters and the date range of the admin page', async () => {
        const response = await get('page=2&pageSize=20&status=pending&cityId=athens&startDate=2026-09-01T00:00:00.000Z&endDate=2026-10-01T00:00:00.000Z');

        expect(response.status).toBe(200);
        expect(grouped).toHaveBeenCalledWith({
            cityId: 'athens',
            status: 'pending',
            type: undefined,
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2026-10-01T00:00:00.000Z'),
            page: 2,
            pageSize: 20,
        });
    });

    it('reads the first page of 20 without a query, with no date range', async () => {
        await get('');

        expect(grouped).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20, startDate: undefined, endDate: undefined }));
    });

    it('ends a range with a start date only 90 days ahead', async () => {
        await get('startDate=2026-09-01T00:00:00Z');

        const { endDate } = grouped.mock.calls[0][0];
        expect(endDate.getTime()).toBeGreaterThan(Date.now() + 89 * 24 * 60 * 60 * 1000);
    });

    it.each([
        ['page=abc', ['page']],
        ['page=1.5', ['page']],
        ['pageSize=1000', ['pageSize']],
        ['status=lost', ['status']],
        ['startDate=yesterday', ['startDate']],
    ])('answers %s with a 400 ValidationError', async (query, path) => {
        const response = await get(query);

        expect(response.status).toBe(400);
        const json = await response.json();
        expect(validationErrorSchema.safeParse(json).success).toBe(true);
        expect(json.error.map((issue: { path: unknown[] }) => issue.path)).toEqual([path]);
        expect(grouped).not.toHaveBeenCalled();
    });
});
