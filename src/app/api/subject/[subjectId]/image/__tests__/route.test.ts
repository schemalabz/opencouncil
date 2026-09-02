/** @jest-environment node */

const mockAfter = jest.fn((fn: () => unknown) => { fn(); });
jest.mock('next/server', () => {
    const actual = jest.requireActual('next/server');
    return { ...actual, after: (fn: () => unknown) => mockAfter(fn) };
});

jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn(),
}));

const mockSubjectFindUnique = jest.fn();
jest.mock('@/lib/db/subject', () => ({
    getSubjectTopicForImage: (...args: unknown[]) => mockSubjectFindUnique(...args),
}));

jest.mock('@/lib/subjectImages', () => ({
    generateImageForSubject: jest.fn(),
    generateImageForSubjectInBackground: jest.fn().mockResolvedValue(undefined),
    isSubjectImageGenerationEnabled: jest.fn(),
    resolveSubjectImage: jest.fn(),
    storeSubjectImage: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { getCurrentUser } from '@/lib/auth';
import {
    generateImageForSubject,
    generateImageForSubjectInBackground,
    isSubjectImageGenerationEnabled,
    resolveSubjectImage,
    storeSubjectImage,
} from '@/lib/subjectImages';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockGenerate = generateImageForSubject as jest.MockedFunction<typeof generateImageForSubject>;
const mockGenerateInBackground = generateImageForSubjectInBackground as jest.MockedFunction<typeof generateImageForSubjectInBackground>;
const mockEnabled = isSubjectImageGenerationEnabled as jest.MockedFunction<typeof isSubjectImageGenerationEnabled>;
const mockResolve = resolveSubjectImage as jest.MockedFunction<typeof resolveSubjectImage>;
const mockStore = storeSubjectImage as jest.MockedFunction<typeof storeSubjectImage>;

const context = { params: Promise.resolve({ subjectId: 'subj-1' }) };
const url = 'http://localhost/api/subject/subj-1/image';

beforeEach(() => {
    jest.clearAllMocks();
    mockEnabled.mockReturnValue(true);
});

describe('GET /api/subject/[subjectId]/image', () => {
    it('redirects to the stored image with a public cache header', async () => {
        mockResolve.mockResolvedValue({ url: 'https://cdn/subject-images/8bit/subj-1.webp?v=abc' });

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('https://cdn/subject-images/8bit/subj-1.webp?v=abc');
        expect(res.headers.get('cache-control')).toContain('public');
        expect(mockSubjectFindUnique).not.toHaveBeenCalled();
    });

    it('serves the topic fallback and schedules a generation on a miss', async () => {
        mockResolve.mockResolvedValue(null);
        mockSubjectFindUnique.mockResolvedValue({ topic: { colorHex: '#2a9d8f', icon: 'leaf' } });

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/svg+xml');
        expect(await res.text()).toContain('<svg');
        expect(mockAfter).toHaveBeenCalledTimes(1);
        expect(mockGenerateInBackground).toHaveBeenCalledWith('subj-1');
    });

    it('does not schedule a generation when generation is off', async () => {
        mockResolve.mockResolvedValue(null);
        mockEnabled.mockReturnValue(false);
        mockSubjectFindUnique.mockResolvedValue({ topic: null });

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(200);
        expect(mockAfter).not.toHaveBeenCalled();
    });

    it('serves the fallback without a generation when the bucket lookup fails', async () => {
        mockResolve.mockRejectedValue(new Error('InvalidAccessKeyId'));
        mockSubjectFindUnique.mockResolvedValue({ topic: null });
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/svg+xml');
        expect(mockAfter).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown subject', async () => {
        mockResolve.mockResolvedValue(null);
        mockSubjectFindUnique.mockResolvedValue(null);

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(404);
        expect(mockAfter).not.toHaveBeenCalled();
    });
});

describe('POST /api/subject/[subjectId]/image', () => {
    const generateRequest = () => new NextRequest(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'generate' }),
    });

    const uploadRequest = (file: File) => {
        const form = new FormData();
        form.append('file', file);
        return new NextRequest(url, { method: 'POST', body: form });
    };

    it('rejects a non-superadmin', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: false } as never);

        const res = await POST(generateRequest(), context);

        expect(res.status).toBe(403);
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('regenerates with force for a superadmin', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        mockGenerate.mockResolvedValue('generated');

        const res = await POST(generateRequest(), context);

        expect(res.status).toBe(200);
        expect(mockGenerate).toHaveBeenCalledWith('subj-1', { force: true });
        expect(await res.json()).toEqual({ ok: true, mode: 'generate', outcome: 'generated' });
    });

    it('returns 503 for generate mode when generation is off', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        mockEnabled.mockReturnValue(false);

        const res = await POST(generateRequest(), context);

        expect(res.status).toBe(503);
    });

    it('turns a generation failure into a 500', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        mockGenerate.mockRejectedValue(new Error('Gemini said no'));

        const res = await POST(generateRequest(), context);

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Gemini said no' });
    });

    it('stores an uploaded image', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });

        const res = await POST(uploadRequest(file), context);

        expect(res.status).toBe(200);
        expect(mockStore).toHaveBeenCalledWith('subj-1', expect.any(Buffer));
        expect(Buffer.from(mockStore.mock.calls[0][1])).toEqual(Buffer.from([1, 2, 3]));
    });

    it('rejects an upload of an unsupported type', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });

        const res = await POST(uploadRequest(file), context);

        expect(res.status).toBe(400);
        expect(mockStore).not.toHaveBeenCalled();
    });

    it('rejects a body without a known mode', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        const req = new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

        const res = await POST(req, context);

        expect(res.status).toBe(400);
    });
});
