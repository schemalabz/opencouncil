/** @jest-environment node */
const mockWithRight = jest.fn();
jest.mock('@/lib/auth', () => ({
    withRight: (...args: unknown[]) => mockWithRight(...args),
}));
const mockGetPollingHistory = jest.fn();
jest.mock('@/lib/tasks/pollDecisions', () => ({
    requestPollDecisions: jest.fn(),
    resolveCandidateConflict: jest.fn(),
    getPollingHistoryForMeeting: (...args: unknown[]) => mockGetPollingHistory(...args),
    getLastPollTimeForMeeting: jest.fn(),
    requestPollDecisionForSubject: jest.fn(),
}));
jest.mock('@/lib/db/decisions', () => ({ getDecisionForSubject: jest.fn() }));

import { getPollingHistoryForMeeting } from '../decisions';

beforeEach(() => {
    mockWithRight.mockReset();
    mockGetPollingHistory.mockReset();
    mockGetPollingHistory.mockResolvedValue({ totalPolls: 1 });
});

describe('getPollingHistoryForMeeting', () => {
    it('authorizes the caller for the meeting it was handed', async () => {
        mockWithRight.mockResolvedValue(true);
        await expect(getPollingHistoryForMeeting('city-1', 'meeting-1')).resolves.toEqual({ totalPolls: 1 });
        expect(mockWithRight).toHaveBeenCalledWith('records.read', { cityId: 'city-1', councilMeetingId: 'meeting-1' });
    });

    it('reads nothing when the caller is not authorized', async () => {
        mockWithRight.mockRejectedValue(new Error('Not authorized'));
        await expect(getPollingHistoryForMeeting('city-1', 'meeting-1')).rejects.toThrow('Not authorized');
        expect(mockGetPollingHistory).not.toHaveBeenCalled();
    });
});
