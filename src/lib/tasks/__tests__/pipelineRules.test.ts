/** @jest-environment node */

const mockFindFirst = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: { taskStatus: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } },
}));

import { findConflictingTask } from '../pipelineRules';

beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
});

describe('findConflictingTask', () => {
    it('keeps transcribe apart from fixTranscript and summarize, in both directions', async () => {
        await findConflictingTask('transcribe', 'athens', 'm1');
        expect(mockFindFirst.mock.calls[0][0].where).toMatchObject({
            cityId: 'athens', councilMeetingId: 'm1',
            type: { in: ['fixTranscript', 'summarize'] }, status: { notIn: ['succeeded', 'failed'] },
        });

        await findConflictingTask('summarize', 'athens', 'm1');
        expect(mockFindFirst.mock.calls[1][0].where.type).toEqual({ in: ['transcribe'] });
        await findConflictingTask('fixTranscript', 'athens', 'm1');
        expect(mockFindFirst.mock.calls[2][0].where.type).toEqual({ in: ['transcribe'] });
    });

    it('lets every other step through without a read', async () => {
        for (const type of ['processAgenda', 'humanReview', 'generateHighlight', 'pollDecisions'] as const) {
            await expect(findConflictingTask(type, 'athens', 'm1')).resolves.toBeNull();
        }
        expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('returns the blocking task', async () => {
        mockFindFirst.mockResolvedValue({ id: 't9', type: 'transcribe' });
        await expect(findConflictingTask('summarize', 'athens', 'm1')).resolves.toEqual({ id: 't9', type: 'transcribe' });
    });
});
