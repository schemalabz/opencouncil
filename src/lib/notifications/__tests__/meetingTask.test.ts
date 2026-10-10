/** @jest-environment node */

const mockCreate = jest.fn();
const mockRelease = jest.fn();
const mockCreatedAlert = jest.fn();
const mockSentAlert = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/notifications', () => ({ createNotificationsForMeeting: (...args: unknown[]) => mockCreate(...args) }));
jest.mock('@/lib/notifications/deliver', () => ({ releaseNotifications: (...args: unknown[]) => mockRelease(...args) }));
jest.mock('@/lib/discord', () => ({
    sendNotificationsCreatedAdminAlert: (...args: unknown[]) => mockCreatedAlert(...args),
    sendNotificationsSentAdminAlert: (...args: unknown[]) => mockSentAlert(...args),
}));

import { notifyMeetingSubjects } from '../meetingTask';

const meeting = (notificationBehavior: 'NOTIFICATIONS_DISABLED' | 'NOTIFICATIONS_APPROVAL' | 'NOTIFICATIONS_AUTO') => ({
    id: 'youth_feb14_2026', cityId: 'chania', name: null, name_en: null, kind: 'regular' as const, sessionNumber: null,
    dateTime: new Date('2026-02-14T16:00:00Z'),
    administrativeBody: { name: 'ΔΣΝ', name_en: 'Youth Council', notificationBehavior },
    city: { name_en: 'Chania', timezone: 'Europe/Athens' },
});

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCreate.mockResolvedValue({ notificationsCreated: 2, subjectsTotal: 3, notificationIds: ['n1', 'n2'] });
    mockRelease.mockResolvedValue({ success: true, emailsSent: 2, skipped: 0, failed: 0, leftPending: 0 });
});

describe('notifyMeetingSubjects', () => {
    it('creates nothing for a disabled body or a meeting with no body', async () => {
        await notifyMeetingSubjects(meeting('NOTIFICATIONS_DISABLED'), 'beforeMeeting');
        await notifyMeetingSubjects({ ...meeting('NOTIFICATIONS_AUTO'), administrativeBody: null }, 'beforeMeeting');
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('creates and leaves pending for a body on approval', async () => {
        await notifyMeetingSubjects(meeting('NOTIFICATIONS_APPROVAL'), 'beforeMeeting');
        expect(mockCreate).toHaveBeenCalledWith('chania', 'youth_feb14_2026', 'beforeMeeting');
        expect(mockCreatedAlert).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'chania', meetingId: 'youth_feb14_2026', notificationType: 'beforeMeeting', notificationsCreated: 2, autoSend: false }));
        expect(mockRelease).not.toHaveBeenCalled();
    });

    it('creates and releases at once for a body on auto', async () => {
        await notifyMeetingSubjects(meeting('NOTIFICATIONS_AUTO'), 'afterMeeting');
        expect(mockRelease).toHaveBeenCalledWith(['n1', 'n2']);
        expect(mockSentAlert).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'chania', notificationCount: 2, emailsSent: 2 }));
    });

    it('sends no alert when nobody is to be notified', async () => {
        mockCreate.mockResolvedValue({ notificationsCreated: 0, subjectsTotal: 3, notificationIds: [] });
        await notifyMeetingSubjects(meeting('NOTIFICATIONS_AUTO'), 'beforeMeeting');
        expect(mockCreatedAlert).not.toHaveBeenCalled();
        expect(mockRelease).toHaveBeenCalledWith([]);
    });

    it('swallows a failure: the subjects are saved, and the admin can send by hand', async () => {
        mockCreate.mockRejectedValue(new Error('db down'));
        await expect(notifyMeetingSubjects(meeting('NOTIFICATIONS_AUTO'), 'beforeMeeting')).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalled();
    });
});
