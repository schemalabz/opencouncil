/** @jest-environment node */
jest.mock('@/lib/uploads', () => ({ completeUpload: jest.fn() }));

import { POST } from '../route';
import { completeUpload } from '@/lib/uploads';
import { ForbiddenError } from '@/lib/api/errors';

const complete = completeUpload as jest.Mock;
const post = (body: unknown) => POST({ json: async () => body } as never);
const ARGS = { key: 'uploads/chania_nov5_2026_recording_0a1b2c3d.mp4', uploadId: 'u1', token: 't', sizeBytes: 2000000000 };

beforeEach(() => jest.clearAllMocks());

describe('POST /api/upload/complete', () => {
    it('completes the upload and answers with its public URL', async () => {
        complete.mockResolvedValue({ key: ARGS.key, publicUrl: 'https://bucket.test/k', sizeBytes: ARGS.sizeBytes });
        const response = await post(ARGS);

        expect(response.status).toBe(200);
        expect(complete).toHaveBeenCalledWith(ARGS);
        expect(await response.json()).toMatchObject({ publicUrl: 'https://bucket.test/k' });
    });

    it('answers 403 to a token of another upload', async () => {
        complete.mockRejectedValue(new ForbiddenError('This token does not belong to this upload'));
        expect((await post(ARGS)).status).toBe(403);
    });

    it('refuses a request without the token', async () => {
        const { token: _omitted, ...withoutToken } = ARGS;
        expect((await post(withoutToken)).status).toBe(400);
        expect(complete).not.toHaveBeenCalled();
    });
});
