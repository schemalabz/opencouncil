/** @jest-environment node */
// The task server posts results to this route with no session — possession of
// the unguessable taskStatusId is the authorization. These tests pin that the
// route keeps working for anonymous callers (the auth mock throws, as the real
// withUserAuthorizedToEdit does without a session).
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(false),
    withUserAuthorizedToEdit: jest.fn().mockRejectedValue(new Error('Not authorized')),
}));

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { taskStatus: { findUnique: jest.fn() } },
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

import { GET, POST } from './route';
import prisma from '@/lib/db/prisma';
import { handleTaskUpdate } from '@/lib/tasks/tasks';

const mockFindUnique = prisma.taskStatus.findUnique as jest.MockedFunction<typeof prisma.taskStatus.findUnique>;
const mockHandleTaskUpdate = handleTaskUpdate as jest.MockedFunction<typeof handleTaskUpdate>;

const TASK = {
    id: 'task1',
    type: 'transcribe',
    status: 'processing',
    stage: 'transcribing',
    percentComplete: 50,
    cityId: 'chania',
    councilMeetingId: 'aug24_2026',
    requestBody: '{}',
    responseBody: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const props = { params: Promise.resolve({ taskStatusId: 'task1' }) };

function postRequest(body: unknown) {
    return { json: async () => body } as never;
}

describe('anonymous task-server callback (POST)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('accepts the update without a session', async () => {
        mockFindUnique.mockResolvedValue(TASK as never);
        mockHandleTaskUpdate.mockResolvedValue(undefined as never);

        const res = await POST(postRequest({ status: 'success', result: {}, version: 1 }), props);

        expect(res.status).toBe(200);
        expect(mockHandleTaskUpdate).toHaveBeenCalledWith('task1', expect.anything(), expect.anything());
    });

    it('returns 404 for an unknown task id', async () => {
        mockFindUnique.mockResolvedValue(null as never);

        const res = await POST(postRequest({ status: 'success' }), props);

        expect(res.status).toBe(404);
        expect(mockHandleTaskUpdate).not.toHaveBeenCalled();
    });
});

describe('anonymous progress polling (GET)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns progress fields only', async () => {
        mockFindUnique.mockResolvedValue(TASK as never);

        const res = await GET({} as never, props);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('processing');
        expect(body.percentComplete).toBe(50);
        expect(body.requestBody).toBeUndefined();
        expect(body.responseBody).toBeUndefined();
    });
});
