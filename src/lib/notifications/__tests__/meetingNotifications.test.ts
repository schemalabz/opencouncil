/** @jest-environment node */
const mockGetMeeting = jest.fn();
const mockCreate = jest.fn();
const mockFailedAlert = jest.fn();
jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/notifications', () => ({
    getMeetingForNotifications: (...a: unknown[]) => mockGetMeeting(...a),
    createNotificationsForMeeting: (...a: unknown[]) => mockCreate(...a),
    countEmailRecipientsForMeeting: jest.fn(),
}));
jest.mock('@/lib/db/tasksInternal', () => ({ getLastSucceededTaskTimes: async () => ({}) }));
jest.mock('@/lib/discord', () => ({
    sendNotificationsCreatedAdminAlert: jest.fn(),
    sendNotificationsSentAdminAlert: jest.fn(),
    sendNotificationsFailedAdminAlert: (...a: unknown[]) => mockFailedAlert(...a),
}));
jest.mock('../deliver', () => ({ releaseNotifications: jest.fn() }));

import { notifySubscribersOfTask, notifySubscribersOnRelease } from '../meetingNotifications';

describe('a failure of the automatic notifications', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['after a task', () => notifySubscribersOfTask('athens', 'm', 'summarize'), 'afterMeeting'],
        ['on a release', () => notifySubscribersOnRelease('athens', 'm'), 'release'],
    ])('%s does not throw, and alerts the admins with the meeting', async (_case, run, type) => {
        mockGetMeeting.mockRejectedValue(new Error('connection reset'));

        await expect(run()).resolves.toBeUndefined();

        expect(mockFailedAlert).toHaveBeenCalledWith({ cityId: 'athens', meetingId: 'm', notificationType: type, error: 'connection reset' });
        expect(mockCreate).not.toHaveBeenCalled();
    });
});
