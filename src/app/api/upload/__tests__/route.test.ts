/** @jest-environment node */
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/s3', () => ({ uploadFile: jest.fn().mockResolvedValue({ url: 'https://cdn/uploads/x' }) }));

import { POST } from '@/app/api/upload/route';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { uploadFile } from '@/lib/s3';
import { UnauthorizedError } from '@/lib/api/errors';
import { MAX_IMAGE_BYTES } from '@/lib/utils/imageUpload';

const guard = withUserAuthorizedToEdit as jest.Mock;
const upload = uploadFile as jest.Mock;

const post = (file?: File) => {
    const form = new FormData();
    if (file) form.append('file', file);
    return POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }));
};

beforeEach(() => {
    jest.clearAllMocks();
    guard.mockResolvedValue(true);
});

describe('POST /api/upload', () => {
    it('stores an image within the limit', async () => {
        const response = await post(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: 'https://cdn/uploads/x' });
    });

    it('stores a regulation JSON file, as the consultations page sends', async () => {
        const response = await post(new File(['{}'], 'regulation.json', { type: 'application/json' }));

        expect(response.status).toBe(200);
        expect(upload).toHaveBeenCalledTimes(1);
    });

    it('answers 400 for an image over the limit and stores nothing', async () => {
        const response = await post(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'a.png', { type: 'image/png' }));

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: [{ path: ['file'], message: 'Image must be at most 5 MB' }] });
        expect(upload).not.toHaveBeenCalled();
    });

    it('answers 400 for a body without a file', async () => {
        const response = await post();

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: [{ path: ['file'] }] });
        expect(upload).not.toHaveBeenCalled();
    });

    it('answers 400 for a body that is not multipart', async () => {
        const response = await POST(new Request('http://localhost/api/upload', {
            method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
        }));

        expect(response.status).toBe(400);
        expect(upload).not.toHaveBeenCalled();
    });

    it('answers with the status of the guard and stores nothing', async () => {
        guard.mockRejectedValue(new UnauthorizedError());

        const response = await post(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Authentication required' });
        expect(upload).not.toHaveBeenCalled();
    });
});
