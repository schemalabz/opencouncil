/** @jest-environment node */

/**
 * set-acl makes a key public only when presigned-url issued it: the token
 * that route returns with the key is the proof. A key from anywhere else, an
 * upload of another body or city among them, stays private (#828).
 */
const mockSend = jest.fn();

jest.mock('@/lib/s3', () => ({ s3Client: { send: (...args: unknown[]) => mockSend(...args) } }));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_SECRET: 'test-secret' } }));

import { POST } from '../route';
import { mintUploadAclToken } from '@/lib/uploadAclToken';

function request(body: unknown) {
    return { json: async () => body } as never;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
});

describe('POST /api/upload/set-acl', () => {
    it('makes public the key that the token was minted for', async () => {
        const key = 'uploads/chania_nov5_2026_recording.mp4';
        const res = await POST(request({ key, token: mintUploadAclToken(key) }));
        expect(res.status).toBe(200);
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('refuses another key with the token of an issued one', async () => {
        const token = mintUploadAclToken('uploads/chania_nov5_2026_recording.mp4');
        const res = await POST(request({ key: 'uploads/chania_dec23_2025_recording.mp4', token }));
        expect(res.status).toBe(403);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('refuses a request with no token', async () => {
        const res = await POST(request({ key: 'uploads/chania_nov5_2026_recording.mp4' }));
        expect(res.status).toBe(400);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('refuses a token that is not hex of the right length', async () => {
        const res = await POST(request({ key: 'uploads/x.mp4', token: 'abc' }));
        expect(res.status).toBe(403);
        expect(mockSend).not.toHaveBeenCalled();
    });
});
