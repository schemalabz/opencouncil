/** @jest-environment node */
import { NextRequest } from 'next/server';

const mockEnv: { TASK_CALLBACK_SECRET?: string } = {};
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

jest.mock('@/lib/db/tasks', () => ({
    getTaskStatus: jest.fn(),
    deleteTaskStatus: jest.fn(),
}));
jest.mock('@/lib/tasks/tasks', () => ({ handleTaskUpdate: jest.fn() }));
jest.mock('@/lib/tasks/registry', () => ({
    taskHandlers: { transcribe: jest.fn() },
    taskTerminalHooks: {},
}));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

import { POST, DELETE } from './route';
import { getTaskStatus, deleteTaskStatus } from '@/lib/db/tasks';
import { handleTaskUpdate } from '@/lib/tasks/tasks';

const mockGetTaskStatus = getTaskStatus as jest.MockedFunction<typeof getTaskStatus>;
const mockDeleteTaskStatus = deleteTaskStatus as jest.MockedFunction<typeof deleteTaskStatus>;
const mockHandleTaskUpdate = handleTaskUpdate as jest.MockedFunction<typeof handleTaskUpdate>;

const CITY = 'athens';
const MEETING = 'meeting-1';
const TASK_ID = 'task-uuid';

const params = (overrides?: Partial<{ cityId: string; meetingId: string; taskStatusId: string }>) =>
    Promise.resolve({ cityId: CITY, meetingId: MEETING, taskStatusId: TASK_ID, ...overrides });

const fakeTask = {
    id: TASK_ID,
    type: 'transcribe',
    cityId: CITY,
    councilMeetingId: MEETING,
    updatedAt: new Date('2000-01-01'),
} as any;

const postRequest = (headers?: Record<string, string>) =>
    new NextRequest('http://test/callback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ status: 'processing', percentComplete: 50 }),
    });

const deleteRequest = (headers?: Record<string, string>) =>
    new NextRequest('http://test/callback', { method: 'DELETE', headers });

describe('taskStatuses callback route', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete mockEnv.TASK_CALLBACK_SECRET;
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    describe('tenant scoping', () => {
        it('POST passes the path tenant scope to getTaskStatus', async () => {
            mockGetTaskStatus.mockResolvedValue(fakeTask);
            mockHandleTaskUpdate.mockResolvedValue(undefined as any);

            const res = await POST(postRequest(), { params: params() });

            expect(res.status).toBe(200);
            expect(mockGetTaskStatus).toHaveBeenCalledWith(TASK_ID, {
                cityId: CITY,
                councilMeetingId: MEETING,
            });
        });

        it('POST returns 404 when the task does not belong to the path tenant', async () => {
            // getTaskStatus resolves null when the scoped lookup misses (wrong city/meeting).
            mockGetTaskStatus.mockResolvedValue(null);

            const res = await POST(postRequest(), { params: params({ cityId: 'other-city' }) });

            expect(res.status).toBe(404);
            expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
        });

        it('DELETE returns 404 when deleteTaskStatus deletes nothing (tenant mismatch)', async () => {
            mockGetTaskStatus.mockResolvedValue(fakeTask);
            mockDeleteTaskStatus.mockResolvedValue(0);

            const res = await DELETE(deleteRequest(), { params: params() });

            expect(res.status).toBe(404);
            expect(mockDeleteTaskStatus).toHaveBeenCalledWith(TASK_ID, {
                cityId: CITY,
                councilMeetingId: MEETING,
            });
        });

        it('DELETE removes the scoped task and revalidates on success', async () => {
            mockGetTaskStatus.mockResolvedValue(fakeTask); // updatedAt is well in the past
            mockDeleteTaskStatus.mockResolvedValue(1);

            const res = await DELETE(deleteRequest(), { params: params() });

            expect(res.status).toBe(200);
            expect(mockDeleteTaskStatus).toHaveBeenCalledWith(TASK_ID, {
                cityId: CITY,
                councilMeetingId: MEETING,
            });
        });
    });

    describe('optional callback auth', () => {
        it('allows POST when TASK_CALLBACK_SECRET is unset (backwards compatible)', async () => {
            mockGetTaskStatus.mockResolvedValue(fakeTask);
            mockHandleTaskUpdate.mockResolvedValue(undefined as any);

            const res = await POST(postRequest(), { params: params() });

            expect(res.status).toBe(200);
        });

        it('rejects POST with 401 when secret is set but header missing', async () => {
            mockEnv.TASK_CALLBACK_SECRET = 's3cret';
            mockGetTaskStatus.mockResolvedValue(fakeTask);

            const res = await POST(postRequest(), { params: params() });

            expect(res.status).toBe(401);
            expect(mockGetTaskStatus).not.toHaveBeenCalled();
            expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
        });

        it('rejects POST with 401 on wrong secret (including differing length)', async () => {
            mockEnv.TASK_CALLBACK_SECRET = 's3cret';
            mockGetTaskStatus.mockResolvedValue(fakeTask);

            const res = await POST(postRequest({ authorization: 'Bearer different-length-token' }), {
                params: params(),
            });

            expect(res.status).toBe(401);
        });

        it('allows POST with the correct bearer secret', async () => {
            mockEnv.TASK_CALLBACK_SECRET = 's3cret';
            mockGetTaskStatus.mockResolvedValue(fakeTask);
            mockHandleTaskUpdate.mockResolvedValue(undefined as any);

            const res = await POST(postRequest({ authorization: 'Bearer s3cret' }), {
                params: params(),
            });

            expect(res.status).toBe(200);
        });

        it('rejects DELETE with 401 when secret is set but header missing', async () => {
            mockEnv.TASK_CALLBACK_SECRET = 's3cret';

            const res = await DELETE(deleteRequest(), { params: params() });

            expect(res.status).toBe(401);
            expect(mockGetTaskStatus).not.toHaveBeenCalled();
        });

        it('allows DELETE with the correct bearer secret', async () => {
            mockEnv.TASK_CALLBACK_SECRET = 's3cret';
            mockGetTaskStatus.mockResolvedValue(fakeTask);
            mockDeleteTaskStatus.mockResolvedValue(1);

            const res = await DELETE(deleteRequest({ authorization: 'Bearer s3cret' }), {
                params: params(),
            });

            expect(res.status).toBe(200);
        });
    });
});
