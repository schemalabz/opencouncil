/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/notifications/deliver', () => ({
    releaseNotifications: jest.fn().mockResolvedValue({ success: true, emailsSent: 1, failed: 0, leftPending: 0 }),
}));
jest.mock('@/lib/discord', () => ({ sendNotificationsSentAdminAlert: jest.fn() }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { notification: { findFirst: jest.fn().mockResolvedValue(null) } } }));

import { POST } from '@/app/api/admin/notifications/release/route';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { validationErrorSchema } from '@/lib/api/errors';

const request = (body: unknown) => new Request('http://localhost/api/admin/notifications/release', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as unknown as NextRequest;

beforeEach(() => {
    jest.clearAllMocks();
    (withUserAuthorizedToEdit as jest.Mock).mockResolvedValue(undefined);
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: 'u1', email: 'admin@example.org' });
});

describe('POST /api/admin/notifications/release', () => {
    it('releases the named notifications', async () => {
        const response = await POST(request({ notificationIds: ['n1', 'n2'] }));

        expect(response.status).toBe(200);
        expect(releaseNotifications).toHaveBeenCalledWith(['n1', 'n2']);
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
