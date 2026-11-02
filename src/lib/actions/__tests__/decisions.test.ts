/** @jest-environment node */
const mockWithUserAuthorizedToEdit = jest.fn();
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
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
    mockWithUserAuthorizedToEdit.mockReset();
    mockGetPollingHistory.mockReset();
    mockGetPollingHistory.mockResolvedValue({ totalPolls: 1 });
});

describe('getPollingHistoryForMeeting', () => {
    it('authorizes the caller for the meeting it was handed', async () => {
        mockWithUserAuthorizedToEdit.mockResolvedValue(true);
        await expect(getPollingHistoryForMeeting('city-1', 'meeting-1')).resolves.toEqual({ totalPolls: 1 });
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'city-1', councilMeetingId: 'meeting-1' });
    });

    it('reads nothing when the caller is not authorized', async () => {
        mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Not authorized'));
        await expect(getPollingHistoryForMeeting('city-1', 'meeting-1')).rejects.toThrow('Not authorized');
        expect(mockGetPollingHistory).not.toHaveBeenCalled();
    });
});
