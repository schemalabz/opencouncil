/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ getAdminRealms: jest.fn(), withRight: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/notifications/deliver', () => ({
    releaseNotifications: jest.fn().mockResolvedValue({ success: true, emailsSent: 1, failed: 0, leftPending: 0 }),
}));
jest.mock('@/lib/discord', () => ({ sendNotificationsSentAdminAlert: jest.fn() }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { notification: { findFirst: jest.fn().mockResolvedValue(null) } },
}));
jest.mock('@/lib/db/notifications', () => ({ getNotificationCityIds: jest.fn() }));

import { POST } from '@/app/api/admin/notifications/release/route';
import { getAdminRealms, getCurrentUser, withRight } from '@/lib/auth';
import { getNotificationCityIds } from '@/lib/db/notifications';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { ForbiddenError, validationErrorSchema } from '@/lib/api/errors';

const request = (body: unknown) => new Request('http://localhost/api/admin/notifications/release', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as unknown as NextRequest;

beforeEach(() => {
    jest.clearAllMocks();
    (getAdminRealms as jest.Mock).mockResolvedValue(null);
    (withRight as jest.Mock).mockResolvedValue(true);
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: 'u1', email: 'admin@example.org' });
    (getNotificationCityIds as jest.Mock).mockResolvedValue([]);
});

describe('POST /api/admin/notifications/release', () => {
    it('releases the named notifications', async () => {
        const response = await POST(request({ notificationIds: ['n1', 'n2'] }));

        expect(response.status).toBe(200);
        expect(releaseNotifications).toHaveBeenCalledWith(['n1', 'n2']);
    });

    it('checks the admin right on every city the notifications belong to', async () => {
        (getNotificationCityIds as jest.Mock).mockResolvedValue(['athens', 'krakow']);

        await POST(request({ notificationIds: ['n1', 'n2'] }));

        expect(withRight).toHaveBeenCalledWith('admin', { cityId: 'athens' });
        expect(withRight).toHaveBeenCalledWith('admin', { cityId: 'krakow' });
    });

    it('releases nothing when the viewer does not administer one of the cities', async () => {
        (getNotificationCityIds as jest.Mock).mockResolvedValue(['athens', 'krakow']);
        (withRight as jest.Mock).mockImplementation(async (_right: string, scope: { cityId?: string }) => {
            if (scope.cityId === 'krakow') throw new ForbiddenError('no');
            return true;
        });

        const response = await POST(request({ notificationIds: ['n1', 'n2'] }));

        expect(response.status).toBe(403);
        expect(releaseNotifications).not.toHaveBeenCalled();
    });

    it.each([
        [{}, ['notificationIds']],
        [{ notificationIds: [] }, ['notificationIds']],
        [{ notificationIds: [1] }, ['notificationIds', 0]],
        [{ notificationIds: [''] }, ['notificationIds', 0]],
    ])('answers %j with a 400 ValidationError and releases nothing', async (body, path) => {
        const response = await POST(request(body));

        expect(response.status).toBe(400);
        const json = await response.json();
        expect(validationErrorSchema.safeParse(json).success).toBe(true);
        expect(json.error.map((issue: { path: unknown[] }) => issue.path)).toEqual([path]);
        expect(releaseNotifications).not.toHaveBeenCalled();
    });
});
