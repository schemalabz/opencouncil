/** @jest-environment node */
// The task server posts results to this route with no session — possession of
// the unguessable taskStatusId plus a valid HMAC callback token is the
// authorization. These tests pin that the route keeps working for anonymous
// callers (the auth mock throws, as the real withUserAuthorizedToEdit does
// without a session), and that every lookup is scoped to the tenant in the
// path so a task from another city/meeting 404s.
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(false),
    withUserAuthorizedToEdit: jest.fn().mockRejectedValue(new Error('Not authorized')),
}));

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { taskStatus: { findUnique: jest.fn(), findFirst: jest.fn() } },
}));

jest.mock('@/lib/db/tasks', () => ({
    deleteTaskStatus: jest.fn(),
}));

jest.mock('@/lib/tasks/tasks', () => ({
    handleTaskUpdate: jest.fn(),
}));

jest.mock('@/lib/tasks/registry', () => ({
    taskHandlers: { transcribe: jest.fn() },
}));

jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
}));

jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret' },
}));

import { GET, POST, DELETE } from './route';
import prisma from '@/lib/db/prisma';
import { deleteTaskStatus } from '@/lib/db/tasks';
import { handleTaskUpdate } from '@/lib/tasks/tasks';
import { mintCallbackToken } from '@/lib/tasks/callbackToken';
import { isUserAuthorizedToEdit } from '@/lib/auth';

const mockFindFirst = prisma.taskStatus.findFirst as jest.MockedFunction<typeof prisma.taskStatus.findFirst>;
const mockHandleTaskUpdate = handleTaskUpdate as jest.MockedFunction<typeof handleTaskUpdate>;
const mockDeleteTaskStatus = deleteTaskStatus as jest.MockedFunction<typeof deleteTaskStatus>;
const mockIsUserAuthorizedToEdit = isUserAuthorizedToEdit as jest.MockedFunction<typeof isUserAuthorizedToEdit>;

const CITY = 'chania';
const MEETING = 'aug24_2026';

const TASK = {
    id: 'task1',
    type: 'transcribe',
    status: 'processing',
    stage: 'transcribing',
    percentComplete: 50,
    cityId: CITY,
    councilMeetingId: MEETING,
    requestBody: '{}',
    responseBody: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date('2000-01-01'),
};

const propsFor = (overrides?: Partial<{ cityId: string; meetingId: string; taskStatusId: string }>) => ({
    params: Promise.resolve({ cityId: CITY, meetingId: MEETING, taskStatusId: 'task1', ...overrides }),
});

const props = propsFor();

function postRequest(body: unknown, token?: string) {
    const url = new URL('http://localhost/api/x' + (token !== undefined ? `?token=${token}` : ''));
    return { json: async () => body, nextUrl: url } as never;
}

describe('anonymous task-server callback (POST)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    it('accepts a tokenized update with no session', async () => {
        mockFindFirst.mockResolvedValue(TASK as never);
        mockHandleTaskUpdate.mockResolvedValue(undefined as never);

        const res = await POST(postRequest({ status: 'success', result: {}, version: 1 }, mintCallbackToken('task1')), props);

        expect(res.status).toBe(200);
        expect(mockHandleTaskUpdate).toHaveBeenCalledWith('task1', expect.anything(), expect.anything());
    });

    it('scopes the lookup to the city/meeting in the path', async () => {
        mockFindFirst.mockResolvedValue(TASK as never);
        mockHandleTaskUpdate.mockResolvedValue(undefined as never);

        await POST(postRequest({ status: 'success', result: {}, version: 1 }, mintCallbackToken('task1')), props);

        expect(mockFindFirst).toHaveBeenCalledWith({
            where: { id: 'task1', cityId: CITY, councilMeetingId: MEETING },
        });
    });

    it('returns 404 when the task belongs to a different tenant', async () => {
        // A token minted for this task id is still valid, but the scoped lookup misses.
        mockFindFirst.mockResolvedValue(null as never);

        const res = await POST(
            postRequest({ status: 'success' }, mintCallbackToken('task1')),
            propsFor({ cityId: 'other-city' })
        );

        expect(res.status).toBe(404);
        expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown task id', async () => {
        mockFindFirst.mockResolvedValue(null as never);

        const res = await POST(postRequest({ status: 'success' }, mintCallbackToken('task1')), props);

        expect(res.status).toBe(404);
        expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
    });

    it('rejects a callback with no token at all', async () => {
        mockFindFirst.mockResolvedValue(TASK as never);

        const res = await POST(postRequest({ status: 'success' }), props);

        expect(res.status).toBe(401);
        expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
    });

    it('rejects a token minted for a different task', async () => {
        mockFindFirst.mockResolvedValue(TASK as never);

        const res = await POST(postRequest({ status: 'success' }, mintCallbackToken('other-task')), props);

        expect(res.status).toBe(401);
        expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
    });
});

describe('DELETE tenant scoping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        mockIsUserAuthorizedToEdit.mockResolvedValue(true as never);
    });

    it('returns 404 without attempting a delete when the task is in another tenant', async () => {
        mockFindFirst.mockResolvedValue(null as never);

        const res = await DELETE({} as never, propsFor({ cityId: 'other-city' }));

        expect(res.status).toBe(404);
        expect(mockDeleteTaskStatus).not.toHaveBeenCalled();
    });

    it('returns 404 when the scoped delete removes no rows (already gone / race)', async () => {
        mockFindFirst.mockResolvedValue(TASK as never);
        mockDeleteTaskStatus.mockResolvedValue(0 as never);

        const res = await DELETE({} as never, props);

        expect(res.status).toBe(404);
        expect(mockDeleteTaskStatus).toHaveBeenCalledWith('task1', { cityId: CITY, councilMeetingId: MEETING });
    });

    it('deletes the scoped task', async () => {
        mockFindFirst.mockResolvedValue(TASK as never);
        mockDeleteTaskStatus.mockResolvedValue(1 as never);

        const res = await DELETE({} as never, props);

        expect(res.status).toBe(200);
        expect(mockDeleteTaskStatus).toHaveBeenCalledWith('task1', { cityId: CITY, councilMeetingId: MEETING });
    });
});

describe('anonymous progress polling (GET)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsUserAuthorizedToEdit.mockResolvedValue(false as never);
    });

    it('returns progress fields only', async () => {
        mockFindFirst.mockResolvedValue(TASK as never);

        const res = await GET({} as never, props);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('processing');
        expect(body.percentComplete).toBe(50);
        expect(body.requestBody).toBeUndefined();
        expect(body.responseBody).toBeUndefined();
    });

    it('returns 404 when the task belongs to a different tenant', async () => {
        mockFindFirst.mockResolvedValue(null as never);

        const res = await GET({} as never, propsFor({ meetingId: 'other-meeting' }));

        expect(res.status).toBe(404);
    });
});
