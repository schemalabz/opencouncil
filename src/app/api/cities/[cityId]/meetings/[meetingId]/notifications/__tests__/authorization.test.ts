/** @jest-environment node */
import type { NextRequest } from 'next/server';

/**
 * The manual notifications of a meeting, and the preview of their audience,
 * are for a superadmin only: with `sendImmediately` the request skips the
 * approval queue. An admin of the city and an admin of the meeting's body
 * get 403. These tests run the real guard of `@/lib/auth` against a stubbed
 * session.
 */
const mockAuth = jest.fn();
jest.mock('@/auth', () => ({ auth: () => mockAuth() }));

const mockPrisma = {
    user: { findUnique: jest.fn() },
    councilMeeting: { findUnique: jest.fn() },
};
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: mockPrisma }));
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeetingDirect: jest.fn().mockResolvedValue({ id: 'm1' }) }));
jest.mock('@/lib/db/administrativeBodies', () => ({ getMeetingBodySettings: jest.fn().mockResolvedValue(null) }));
// The preview runs the real read of `@/lib/db/notifications`, whose guard is under test.
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/lib/db/notifications', () => ({
    ...jest.requireActual('@/lib/db/notifications'),
    createNotificationsForMeeting: jest.fn().mockResolvedValue({ notificationsCreated: 0, subjectsTotal: 0, notificationIds: [] }),
}));
jest.mock('@/lib/notifications/deliver', () => ({ releaseNotifications: jest.fn() }));
jest.mock('@/lib/discord', () => ({ sendNotificationsCreatedAdminAlert: jest.fn(), sendNotificationsSentAdminAlert: jest.fn() }));

import { POST } from '@/app/api/cities/[cityId]/meetings/[meetingId]/notifications/route';
import { POST as PREVIEW } from '@/app/api/cities/[cityId]/meetings/[meetingId]/notifications/preview/route';
import { createNotificationsForMeeting } from '@/lib/db/notifications';
import { getMeetingBodySettings } from '@/lib/db/administrativeBodies';

const CITY = 'athens';
const MEETING = 'm1';
const BODY = 'youth';
const params = { params: Promise.resolve({ cityId: CITY, meetingId: MEETING }) };
const request = (body: unknown) => new Request(`http://localhost/api/cities/${CITY}/meetings/${MEETING}/notifications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as unknown as NextRequest;
const SEND_NOW = { type: 'beforeMeeting', subjectImportances: {}, sendImmediately: true };

type Administers = { cityId: string | null; administrativeBodyId: string | null };

function signInAs(isSuperAdmin: boolean, administers: Administers[] = []) {
    mockAuth.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        isSuperAdmin,
        administers: administers.map(a => ({ partyId: null, personId: null, ...a, administrativeBody: a.administrativeBodyId ? { id: a.administrativeBodyId, cityId: CITY } : null })),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.councilMeeting.findUnique.mockResolvedValue({ administrativeBodyId: BODY });
});

describe.each<[string, Administers]>([
    ['an admin of the city', { cityId: CITY, administrativeBodyId: null }],
    ['an admin of the body of the meeting', { cityId: null, administrativeBodyId: BODY }],
])('%s', (_label, scope) => {
    beforeEach(() => signInAs(false, [scope]));

    it('gets 403 from the manual notifications, and creates nothing', async () => {
        const response = await POST(request(SEND_NOW), params);

        expect(response.status).toBe(403);
        expect(createNotificationsForMeeting).not.toHaveBeenCalled();
    });

    it('gets 403 from the preview of the audience', async () => {
        const response = await PREVIEW(request({ subjectImportances: {} }), params);

        expect(response.status).toBe(403);
    });

    it('gets 403, and not the issues of the schema, from a malformed preview request', async () => {
        const response = await PREVIEW(request({ subjectImportances: 'all' }), params);

        expect(response.status).toBe(403);
    });
});

describe('a superadmin', () => {
    beforeEach(() => signInAs(true));

    it('creates the notifications of the meeting', async () => {
        const response = await POST(request(SEND_NOW), params);

        expect(response.status).toBe(200);
        expect(createNotificationsForMeeting).toHaveBeenCalledWith(CITY, MEETING, 'beforeMeeting', {});
    });

    it('gets 409 for a body with its notifications off, after the guard', async () => {
        jest.mocked(getMeetingBodySettings).mockResolvedValueOnce({ notificationBehavior: 'NOTIFICATIONS_DISABLED' } as Awaited<ReturnType<typeof getMeetingBodySettings>>);

        const response = await POST(request(SEND_NOW), params);

        expect(response.status).toBe(409);
        expect(createNotificationsForMeeting).not.toHaveBeenCalled();
    });
});
