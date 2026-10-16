/** @jest-environment node */
// The task server posts results to this route with no session: a valid HMAC
// callback token is the authorization. These tests pin that the route keeps
// working for anonymous callers, and that every verb only reaches a task inside
// the city and meeting named by the path.
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn(),
    withUserAuthorizedToEdit: jest.fn().mockRejectedValue(new Error('Not authorized')),
}));

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { taskStatus: { findFirst: jest.fn(), deleteMany: jest.fn() } },
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

import { GET, POST, PUT, DELETE } from './route';
import { revalidateTag } from 'next/cache';
import prisma from '@/lib/db/prisma';
import { handleTaskUpdate } from '@/lib/tasks/tasks';
import { mintCallbackToken } from '@/lib/tasks/callbackToken';
import { isUserAuthorizedToEdit } from '@/lib/auth';

const mockFindFirst = prisma.taskStatus.findFirst as jest.MockedFunction<typeof prisma.taskStatus.findFirst>;
const mockDeleteMany = prisma.taskStatus.deleteMany as jest.MockedFunction<typeof prisma.taskStatus.deleteMany>;
const mockHandleTaskUpdate = handleTaskUpdate as jest.MockedFunction<typeof handleTaskUpdate>;
const mockIsUserAuthorizedToEdit = isUserAuthorizedToEdit as jest.MockedFunction<typeof isUserAuthorizedToEdit>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<typeof revalidateTag>;

const CITY = 'chania';
const MEETING = 'aug24_2026';
const TEN_MINUTES_MS = 10 * 60 * 1000;

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

// A table holding one row: a lookup finds it only when every field in the where
// clause matches, so a test cannot pass with the tenant scope dropped or swapped.
// As in Prisma, a field the where clause omits matches any value.
type Where = Partial<Record<'id' | 'cityId' | 'councilMeetingId', string>>;
function tableWith(row: typeof TASK) {
    const matches = (where: Where) =>
        (['id', 'cityId', 'councilMeetingId'] as const).every((k) => where[k] === undefined || where[k] === row[k]);
    mockFindFirst.mockImplementation((async ({ where }: { where: Where }) => (matches(where) ? row : null)) as never);
}

const propsFor = (overrides?: Partial<{ cityId: string; meetingId: string; taskStatusId: string }>) => ({
    params: Promise.resolve({ cityId: CITY, meetingId: MEETING, taskStatusId: 'task1', ...overrides }),
});

const props = propsFor();

function callbackRequest(body: unknown, token?: string) {
    const url = new URL('http://localhost/api/x' + (token !== undefined ? `?token=${token}` : ''));
    return { json: async () => body, nextUrl: url } as never;
}

const tokenized = (taskId = 'task1') => callbackRequest({ status: 'success', result: {}, version: 1 }, mintCallbackToken(taskId));

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => { });
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    tableWith(TASK);
    mockDeleteMany.mockResolvedValue({ count: 1 } as never);
    mockHandleTaskUpdate.mockResolvedValue(undefined as never);
    mockIsUserAuthorizedToEdit.mockResolvedValue(false as never);
});

describe('tenant scoping', () => {
    it.each([
        ['GET', () => GET({} as never, props), 200],
        ['GET, other city', () => GET({} as never, propsFor({ cityId: 'other-city' })), 404],
        ['GET, other meeting', () => GET({} as never, propsFor({ meetingId: 'other-meeting' })), 404],
        ['POST', () => POST(tokenized(), props), 200],
        ['POST, other city', () => POST(tokenized(), propsFor({ cityId: 'other-city' })), 404],
        ['POST, other meeting', () => POST(tokenized(), propsFor({ meetingId: 'other-meeting' })), 404],
        ['PUT', () => PUT(tokenized(), props), 200],
        ['PUT, other city', () => PUT(tokenized(), propsFor({ cityId: 'other-city' })), 404],
        ['PUT, other meeting', () => PUT(tokenized(), propsFor({ meetingId: 'other-meeting' })), 404],
        ['DELETE', () => DELETE({} as never, props), 200],
        ['DELETE, other city', () => DELETE({} as never, propsFor({ cityId: 'other-city' })), 404],
        ['DELETE, other meeting', () => DELETE({} as never, propsFor({ meetingId: 'other-meeting' })), 404],
    ])('%s answers %s', async (_label, call, status) => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(true as never);

        const res = await call();

        expect(res.status).toBe(status);
        if (status === 404) {
            expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
            expect(mockDeleteMany).not.toHaveBeenCalled();
        }
    });
});

describe('task-server callback (POST and PUT)', () => {
    it('accepts a tokenized update with no session', async () => {
        const res = await POST(tokenized(), props);

        expect(res.status).toBe(200);
        expect(mockHandleTaskUpdate).toHaveBeenCalledWith('task1', expect.anything(), expect.anything(), { force: false });
    });

    it('hands the result handler the force flag that the request was started with', async () => {
        tableWith({ ...TASK, requestBody: JSON.stringify({ youtubeUrl: 'https://youtu.be/x', force: true }) });

        await POST(tokenized(), props);

        expect(mockHandleTaskUpdate).toHaveBeenCalledWith('task1', expect.anything(), expect.anything(), { force: true });
    });

    it('treats an unreadable request body as not forced', async () => {
        tableWith({ ...TASK, requestBody: 'not json' });

        await POST(tokenized(), props);

        expect(mockHandleTaskUpdate).toHaveBeenCalledWith('task1', expect.anything(), expect.anything(), { force: false });
    });

    it('returns 404 for an unknown task id', async () => {
        const res = await POST(tokenized('unknown'), propsFor({ taskStatusId: 'unknown' }));

        expect(res.status).toBe(404);
        expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
    });

    it('rejects a callback with no token at all', async () => {
        const res = await POST(callbackRequest({ status: 'success' }), props);

        expect(res.status).toBe(401);
        expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
    });

    it('rejects a token minted for a different task', async () => {
        const res = await PUT(tokenized('other-task'), props);

        expect(res.status).toBe(401);
        expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
    });
});

describe('DELETE', () => {
    beforeEach(() => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(true as never);
    });

    it('deletes only a task that is still idle, and revalidates the meeting', async () => {
        const res = await DELETE({} as never, props);

        expect(res.status).toBe(200);
        const { where } = mockDeleteMany.mock.calls[0][0] as { where: { updatedAt: { lte: Date } } };
        expect(where).toEqual({ id: 'task1', cityId: CITY, councilMeetingId: MEETING, updatedAt: { lte: expect.any(Date) } });
        expect(Math.abs(Date.now() - TEN_MINUTES_MS - where.updatedAt.lte.getTime())).toBeLessThan(1000);
        expect(mockRevalidateTag).toHaveBeenCalledWith(`city:${CITY}:meeting:${MEETING}:derived`, 'max');
    });

    it('returns 409 and does not revalidate when the task changed after the check', async () => {
        // A concurrent delete, or a callback that updated the task, leaves nothing to delete.
        mockDeleteMany.mockResolvedValue({ count: 0 } as never);

        const res = await DELETE({} as never, props);

        expect(res.status).toBe(409);
        expect(mockRevalidateTag).not.toHaveBeenCalled();
    });

    it('returns 401 and deletes nothing for a caller who cannot edit the meeting', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(false as never);

        const res = await DELETE({} as never, props);

        expect(res.status).toBe(401);
        expect(mockIsUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY, councilMeetingId: TASK.councilMeetingId });
        expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    it("asks for the city to delete a task that is the city's, such as a human review", async () => {
        tableWith({ ...TASK, type: 'humanReview' });
        mockIsUserAuthorizedToEdit.mockResolvedValue(false as never);

        const res = await DELETE({} as never, props);

        expect(res.status).toBe(401);
        expect(mockIsUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY });
    });

    it('returns 403 and deletes nothing for a task updated within the last 10 minutes', async () => {
        tableWith({ ...TASK, updatedAt: new Date(Date.now() - 9 * 60 * 1000) });

        const res = await DELETE({} as never, props);

        expect(res.status).toBe(403);
        expect(mockDeleteMany).not.toHaveBeenCalled();
    });
});

describe('progress polling (GET)', () => {
    it('returns progress fields only to an anonymous caller', async () => {
        const res = await GET({} as never, props);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('processing');
        expect(body.percentComplete).toBe(50);
        expect(body.requestBody).toBeUndefined();
        expect(body.responseBody).toBeUndefined();
    });

    it('returns the full row to an editor of the city', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(true as never);

        const body = await (await GET({} as never, props)).json();

        expect(body.requestBody).toBe('{}');
        expect(mockIsUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY, councilMeetingId: TASK.councilMeetingId });
    });
});
