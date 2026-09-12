/** @jest-environment node */

import { NextRequest } from 'next/server';
import { UnreadableImageError } from '@opencouncil/subject-images';
import { MAX_IMAGE_BYTES } from '@/lib/utils/imageUpload';
import { GET, POST } from '../route';
import { getCurrentUser } from '@/lib/auth';
import {
    generateImageForSubject,
    generateImageForSubjectInBackground,
    isSubjectImageGenerationEnabled,
    reportLookupFailure,
    resolveSubjectImage,
    storeSubjectImage,
} from '@/lib/subjectImages';

const mockAfter = jest.fn((fn: () => unknown) => { fn(); });
jest.mock('next/server', () => {
    const actual = jest.requireActual('next/server');
    return { ...actual, after: (fn: () => unknown) => mockAfter(fn) };
});

jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn(),
}));

const mockSubjectExists = jest.fn();
jest.mock('@/lib/db/subject', () => ({
    subjectExists: (...args: unknown[]) => mockSubjectExists(...args),
}));

jest.mock('@/lib/subjectImages', () => ({
    generateImageForSubject: jest.fn(),
    generateImageForSubjectInBackground: jest.fn().mockResolvedValue(undefined),
    isSubjectImageGenerationEnabled: jest.fn(),
    reportLookupFailure: jest.fn().mockResolvedValue(undefined),
    resolveSubjectImage: jest.fn(),
    storeSubjectImage: jest.fn().mockResolvedValue(undefined),
}));

// The route needs the id check and the error class; the package root would also load Gemini and sharp.
jest.mock('@opencouncil/subject-images', () => ({
    ...jest.requireActual('@opencouncil/subject-images/store'),
    ...jest.requireActual('@opencouncil/subject-images/image'),
}));

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockGenerate = generateImageForSubject as jest.MockedFunction<typeof generateImageForSubject>;
const mockGenerateInBackground = generateImageForSubjectInBackground as jest.MockedFunction<typeof generateImageForSubjectInBackground>;
const mockEnabled = isSubjectImageGenerationEnabled as jest.MockedFunction<typeof isSubjectImageGenerationEnabled>;
const mockReportLookupFailure = reportLookupFailure as jest.MockedFunction<typeof reportLookupFailure>;
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
        expect(mockSubjectExists).not.toHaveBeenCalled();
    });

    it('answers a cacheable 404 and schedules a generation on a miss', async () => {
        mockResolve.mockResolvedValue(null);
        mockSubjectExists.mockResolvedValue(true);

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(404);
        expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60');
        expect(mockAfter).toHaveBeenCalledTimes(1);
        expect(mockGenerateInBackground).toHaveBeenCalledWith('subj-1');
    });

    it('does not schedule a generation when generation is off', async () => {
        mockResolve.mockResolvedValue(null);
        mockEnabled.mockReturnValue(false);
        mockSubjectExists.mockResolvedValue(true);

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(404);
        expect(mockAfter).not.toHaveBeenCalled();
    });

    it('answers a miss without a generation when the bucket lookup fails, and reports it', async () => {
        const failure = new Error('PermanentRedirect');
        mockResolve.mockRejectedValue(failure);
        mockSubjectExists.mockResolvedValue(true);

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(404);
        expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60');
        expect(mockAfter).not.toHaveBeenCalled();
        expect(mockReportLookupFailure).toHaveBeenCalledWith('subj-1', failure);
    });

    it('rejects an id that is not a subject id before touching the bucket', async () => {
        const evil = { params: Promise.resolve({ subjectId: '..%2F..%2Flogo' }) };

        const res = await GET(new NextRequest('http://localhost/api/subject/..%2F..%2Flogo/image'), evil);

        expect(res.status).toBe(400);
        expect(mockResolve).not.toHaveBeenCalled();
        expect(mockSubjectExists).not.toHaveBeenCalled();
    });

    it('returns an uncached 404 for an unknown subject', async () => {
        mockResolve.mockResolvedValue(null);
        mockSubjectExists.mockResolvedValue(false);

        const res = await GET(new NextRequest(url), context);

        expect(res.status).toBe(404);
        expect(res.headers.get('cache-control')).toBeNull();
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

    beforeEach(() => {
        mockSubjectExists.mockResolvedValue(true);
    });

    it('rejects a non-superadmin', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: false } as never);

        const res = await POST(generateRequest(), context);

        expect(res.status).toBe(403);
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('rejects an id that is not a subject id, so an upload cannot leave the folder', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        const evil = { params: Promise.resolve({ subjectId: '../../logo' }) };

        const res = await POST(uploadRequest(new File(['x'], 'x.png', { type: 'image/png' })), evil);

        expect(res.status).toBe(400);
        expect(mockStore).not.toHaveBeenCalled();
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

    it('answers 409 when the service drew nothing', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        mockGenerate.mockResolvedValue('in-flight');

        const res = await POST(generateRequest(), context);

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: 'Image was not regenerated (in-flight)', outcome: 'in-flight' });
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

    it('answers 400 with the reason when the bytes are not an image the library reads', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        mockStore.mockRejectedValueOnce(new UnreadableImageError('Not a JPEG, PNG, WebP, GIF or AVIF image'));
        // The declared type is the client's word; the bytes are an SVG.
        const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'photo.png', { type: 'image/png' });

        const res = await POST(uploadRequest(file), context);

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Not a JPEG, PNG, WebP, GIF or AVIF image' });
    });

    it('turns a store failure on upload into a 500 with the reason', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        mockStore.mockRejectedValueOnce(new Error('NoSuchBucket'));

        const res = await POST(uploadRequest(new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })), context);

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'NoSuchBucket' });
    });

    it('rejects an upload over the shared size cap before reading it', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'huge.png', { type: 'image/png' });

        const res = await POST(uploadRequest(file), context);

        expect(res.status).toBe(400);
        expect(mockStore).not.toHaveBeenCalled();
    });

    it('answers 404 for a subject that does not exist, so no orphan object is written', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        mockSubjectExists.mockResolvedValue(false);

        const upload = await POST(uploadRequest(new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })), context);
        const generate = await POST(generateRequest(), context);

        expect(upload.status).toBe(404);
        expect(generate.status).toBe(404);
        expect(mockStore).not.toHaveBeenCalled();
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('rejects a body without a known mode', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', isSuperAdmin: true } as never);
        const req = new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

        const res = await POST(req, context);

        expect(res.status).toBe(400);
    });
});
