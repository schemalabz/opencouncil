/** @jest-environment node */

import { getRecentTranscribeFailureErrors, getTasksForMeetingDirect } from '@/lib/db/tasksInternal';

const mockFindMany = jest.fn();
const mockQueryRaw = jest.fn().mockResolvedValue([]);
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { $queryRaw: (...args: unknown[]) => mockQueryRaw(...args), taskStatus: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

// Prisma returns only the selected columns, so the mock does the same.
function pick(row: Record<string, unknown>, select: Record<string, boolean>) {
    return Object.fromEntries(Object.keys(select).map(key => [key, row[key]]));
}

// A transcribe whose result handler threw: responseBody holds the payload.
const handlerFailure = { id: 't1', responseBody: '{"transcript":"raw payload"}', failureReason: 'Error: handler bug' };
// A transcribe that the task server failed.
const serverFailure = { id: 't2', responseBody: null, failureReason: 'video unavailable' };

describe('failure reason readers', () => {
    beforeEach(() => jest.clearAllMocks());

    it('getRecentTranscribeFailureErrors reports failureReason and selects nothing else', async () => {
        mockFindMany.mockImplementation(({ select }: { select: Record<string, boolean> }) =>
            Promise.resolve([handlerFailure, serverFailure].map(row => pick(row, select))));

        const errors = await getRecentTranscribeFailureErrors('city-1', 'meeting-1', 3);

        expect(errors).toEqual(['Error: handler bug', 'video unavailable']);
        expect(mockFindMany.mock.calls[0][0].select).toEqual({ failureReason: true });
    });

    it('getTasksForMeetingDirect gives a failed task its failureReason, not the payload', async () => {
        const row = { type: 'transcribe', status: 'failed', stage: null, percentComplete: null,
            createdAt: new Date(), updatedAt: new Date(), version: 1 };
        mockFindMany.mockImplementation(({ where, select }: { where: { id?: unknown; type?: string }; select: Record<string, boolean> }) =>
            Promise.resolve('responseBody' in where ? [] : where.id
                ? [handlerFailure, serverFailure].map(failed => pick(failed, select))
                : where.type === 'transcribe'
                    ? [{ ...row, id: 't1' }, { ...row, id: 't2' }]
                    : []));

        const tasks = await getTasksForMeetingDirect('city-1', 'meeting-1');

        expect(tasks.find(t => t.id === 't1')?.error).toBe('Error: handler bug');
        expect(tasks.find(t => t.id === 't2')?.error).toBe('video unavailable');
        const failedRead = mockFindMany.mock.calls.find(([args]) => args.where.id)![0];
        expect(failedRead.select).toEqual({ id: true, failureReason: true });
        for (const [args] of mockFindMany.mock.calls) {
            if (!args.where.responseBody) expect(args.select).not.toHaveProperty('responseBody');
            expect(args.select).not.toHaveProperty('requestBody');
        }
        expect(mockQueryRaw).not.toHaveBeenCalled();
        const metadataRead = mockFindMany.mock.calls.find(([args]) => args.where.responseBody)![0];
        expect(metadataRead.where).toMatchObject({ type: 'transcribe', status: 'failed', responseBody: { startsWith: '{"$opencouncilTaskResponse":"media-source-failure-v1",' } });
        expect(metadataRead.select).toEqual({ id: true, responseBody: true });
    });
});


it('does not fetch any response body when only successful transcribes are polled', async () => {
    jest.clearAllMocks();
    mockFindMany.mockImplementation(({ where }: { where: { type: string } }) => Promise.resolve(
        where.type === 'transcribe' ? [{ id: 'success', type: 'transcribe', status: 'succeeded',
            stage: null, percentComplete: 100, version: 6, createdAt: new Date(), updatedAt: new Date() }] : []
    ));
    const tasks = await getTasksForMeetingDirect('city-1', 'meeting-1');
    expect(tasks[0]).not.toHaveProperty('mediaSource');
    expect(mockQueryRaw).not.toHaveBeenCalled();
    for (const [args] of mockFindMany.mock.calls) expect(args.select).not.toHaveProperty('responseBody');
});
