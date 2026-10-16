/** @jest-environment node */

const mockFindMany = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { taskStatus: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/db/highlights', () => ({ getHighlightPermissions: jest.fn() }));

import { TASK_CONFIG, taskTypesSatisfying } from '../types';
import { getMeetingTaskStatus } from '@/lib/db/tasks';
import { getMeetingStatus } from '@/lib/meetingStatus';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('taskTypesSatisfying', () => {
    it('names the step itself and every task that stands in for it', () => {
        expect(taskTypesSatisfying('humanReview')).toEqual(['humanReview', 'fixFromMinutes']);
        expect(taskTypesSatisfying('summarize')).toEqual(['summarize']);
    });

    it('is a pipeline step of its own only where it stands in: fixFromMinutes is optional', () => {
        expect(TASK_CONFIG.fixFromMinutes.requiredForPipeline).toBe(false);
        expect(TASK_CONFIG.fixFromMinutes.standsInFor).toEqual(['humanReview']);
    });
});

describe('a meeting corrected from the municipal minutes', () => {
    it('reads as reviewed, and reaches ready without a review row', async () => {
        mockFindMany.mockResolvedValue([
            { type: 'transcribe', version: 4 },
            { type: 'fixTranscript', version: 3 },
            { type: 'fixFromMinutes', version: 1 },
            { type: 'summarize', version: 5 },
        ]);

        const status = await getMeetingStatus('city-1', 'meeting-1');

        expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ type: { in: expect.arrayContaining(['humanReview', 'fixFromMinutes']) } }),
        }));
        expect(status.tasks.humanReview).toBe(true);
        expect(status.tasks.fixFromMinutes).toBe(true);
        // No person read the names of the speakers, so they stay unverified (#982).
        expect(status.tasks.reviewedByPerson).toBe(false);
        expect(status.ready).toBe(true);
        expect(status.stage).toBe('summarize');
    });

    it('stays unreviewed without the correction', async () => {
        mockFindMany.mockResolvedValue([{ type: 'transcribe', version: 4 }, { type: 'fixTranscript', version: 3 }]);

        const tasks = await getMeetingTaskStatus('city-1', 'meeting-1');

        expect(tasks.humanReview).toBe(false);
        expect(tasks.fixFromMinutes).toBe(false);
        expect(tasks.reviewedByPerson).toBe(false);
    });

    it('reads as reviewed by a person only after a human review', async () => {
        mockFindMany.mockResolvedValue([{ type: 'fixFromMinutes', version: 1 }, { type: 'humanReview', version: 1 }]);

        const tasks = await getMeetingTaskStatus('city-1', 'meeting-1');

        expect(tasks.humanReview).toBe(true);
        expect(tasks.reviewedByPerson).toBe(true);
    });
});
