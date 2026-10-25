/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/db/notifications', () => ({
    createNotificationsForMeeting: jest.fn().mockResolvedValue({ notificationsCreated: 0, subjectsTotal: 2, notificationIds: [] }),
    getNotificationImpactPreviewData: jest.fn().mockResolvedValue({ subjects: [], usersWithPreferences: [] }),
}));
jest.mock('@/lib/notifications/deliver', () => ({ releaseNotifications: jest.fn() }));
jest.mock('@/lib/notifications/matching', () => ({ calculateNotificationImpact: jest.fn().mockResolvedValue({ users: 0 }) }));
jest.mock('@/lib/discord', () => ({ sendNotificationsCreatedAdminAlert: jest.fn(), sendNotificationsSentAdminAlert: jest.fn() }));
// The route first reads the body's notification setting of the meeting; a meeting with no body sends.
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { councilMeeting: { findUnique: jest.fn().mockResolvedValue({ administrativeBody: null }) } } }));

import { POST } from '@/app/api/cities/[cityId]/meetings/[meetingId]/notifications/route';
import { POST as PREVIEW } from '@/app/api/cities/[cityId]/meetings/[meetingId]/notifications/preview/route';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { createNotificationsForMeeting, getNotificationImpactPreviewData } from '@/lib/db/notifications';
import { calculateNotificationImpact } from '@/lib/notifications/matching';
import { ForbiddenError, validationErrorSchema } from '@/lib/api/errors';

const params = { params: Promise.resolve({ cityId: 'athens', meetingId: 'm1' }) };
const request = (body: unknown) => new Request('http://localhost/api/cities/athens/meetings/m1/notifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as unknown as NextRequest;

beforeEach(() => {
    jest.clearAllMocks();
    (withUserAuthorizedToEdit as jest.Mock).mockResolvedValue(undefined);
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: 'u1' });
});

describe('POST /api/cities/[cityId]/meetings/[meetingId]/notifications', () => {
    it('creates the notifications with the importance of each subject, and the defaults for a missing one', async () => {
        const response = await POST(request({
            type: 'beforeMeeting',
            subjectImportances: { s1: { topicImportance: 'high', proximityImportance: 'near' }, s2: {} },
        }), params);

        expect(response.status).toBe(200);
        expect(createNotificationsForMeeting).toHaveBeenCalledWith('athens', 'm1', 'beforeMeeting', {
            s1: { topicImportance: 'high', proximityImportance: 'near' },
            s2: { topicImportance: 'doNotNotify', proximityImportance: 'none' },
        });
    });

    it.each([
        [{ type: 'duringMeeting' }, ['type']],
        [{ type: 'afterMeeting', subjectImportances: { s1: null } }, ['subjectImportances', 's1']],
        [{ type: 'afterMeeting', subjectImportances: { s1: { topicImportance: 'urgent' } } }, ['subjectImportances', 's1', 'topicImportance']],
        [{ type: 'afterMeeting', sendImmediately: 'yes' }, ['sendImmediately']],
    ])('answers %j with a 400 ValidationError and creates nothing', async (body, path) => {
        const response = await POST(request(body), params);

        expect(response.status).toBe(400);
        const json = await response.json();
        expect(validationErrorSchema.safeParse(json).success).toBe(true);
        expect(json.error.map((issue: { path: unknown[] }) => issue.path)).toEqual([path]);
        expect(createNotificationsForMeeting).not.toHaveBeenCalled();
    });
});

describe('POST /api/cities/[cityId]/meetings/[meetingId]/notifications/preview', () => {
    it('previews the impact of the importance of each subject', async () => {
        const response = await PREVIEW(request({ subjectImportances: { s1: { topicImportance: 'normal' } } }), params);

        expect(response.status).toBe(200);
        expect(calculateNotificationImpact).toHaveBeenCalledWith([], [], { s1: { topicImportance: 'normal', proximityImportance: 'none' } });
    });

    it('answers 401 JSON without a session', async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(null);

        const response = await PREVIEW(request({}), params);

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Authentication required' });
        expect(getNotificationImpactPreviewData).not.toHaveBeenCalled();
    });

    it('answers 403 JSON when the read refuses the user', async () => {
        (getNotificationImpactPreviewData as jest.Mock).mockRejectedValueOnce(new ForbiddenError());

        const response = await PREVIEW(request({}), params);

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Not authorized' });
    });

    it('answers a malformed importance with a 400 ValidationError', async () => {
        const response = await PREVIEW(request({ subjectImportances: { s1: { proximityImportance: 'far' } } }), params);

        expect(response.status).toBe(400);
        expect(calculateNotificationImpact).not.toHaveBeenCalled();
    });
});
