/** @jest-environment node */

// The bucket calls are mocked; objectKey and the token are real.
jest.mock('@/env.mjs', () => ({ env: { DO_SPACES_BUCKET: 'bucket', NEXTAUTH_SECRET: 'test-secret' } }));
jest.mock('@/lib/s3', () => ({
    objectKey: jest.requireActual('@/lib/s3').objectKey,
    constructPublicUrl: (bucket: string, key: string) => `https://${bucket}.test/${key}`,
    presignPut: jest.fn(async () => 'https://bucket.test/put'),
    presignPart: jest.fn(async (_key: string, _id: string, n: number) => `https://bucket.test/part-${n}`),
    startMultipartUpload: jest.fn(async () => 'upload-1'),
    listUploadedParts: jest.fn(),
    completeMultipartUpload: jest.fn(),
    objectSize: jest.fn(),
}));

import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { completeMultipartUpload, listUploadedParts, objectSize, presignPart, presignPut, startMultipartUpload } from '@/lib/s3';
import { completeUpload, partsProblem, startUpload, UPLOAD_PART_BYTES } from '../uploads';

const PART = UPLOAD_PART_BYTES;
const RECORDING = { cityId: 'krakow', kind: 'recording' as const, identifier: '2026-10-22' };
const notFound = Object.assign(new Error('NoSuchUpload'), { name: 'NoSuchUpload', $metadata: { httpStatusCode: 404 } });
const part = (partNumber: number, size: number) => ({ partNumber, size, etag: `"etag-${partNumber}"` });

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(completeMultipartUpload).mockReset();
});

describe('startUpload', () => {
    it('signs one PUT, with the headers that make it public, for a file of one part', async () => {
        const plan = await startUpload({ cityId: 'argos', kind: 'agenda', identifier: '2026-10-15' }, 'pdf', 300_000);

        expect(plan.key).toMatch(/^uploads\/argos_2026-10-15_agenda_[0-9a-f]{8}\.pdf$/);
        expect(presignPut).toHaveBeenCalledWith(plan.key, 'application/pdf', 300_000, 300);
        expect(startMultipartUpload).not.toHaveBeenCalled();
        expect(plan).toMatchObject({
            publicUrl: `https://bucket.test/${plan.key}`,
            method: 'PUT',
            headers: { 'Content-Type': 'application/pdf', 'x-amz-acl': 'public-read' },
            partSize: 300_000,
            parts: [{ partNumber: 1, uploadUrl: 'https://bucket.test/put' }],
            expiresIn: 300,
            completion: null,
        });
    });

    it('opens a multipart upload with one URL per part for a bigger file', async () => {
        const plan = await startUpload(RECORDING, 'mp4', 12_300_000_000);

        expect(startMultipartUpload).toHaveBeenCalledWith(plan.key, 'video/mp4');
        expect(plan.key).toMatch(/^uploads\/krakow_2026-10-22_recording_[0-9a-f]{8}\.mp4$/);
        expect(plan.parts.map(p => p.partNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(plan.parts[11].uploadUrl).toBe('https://bucket.test/part-12');
        // Each URL binds the size of its part; the last one takes the rest.
        expect(presignPart).toHaveBeenCalledWith(plan.key, 'upload-1', 1, PART, 43200);
        expect(presignPart).toHaveBeenCalledWith(plan.key, 'upload-1', 12, 12_300_000_000 - 11 * PART, 43200);
        expect(plan).toMatchObject({ headers: {}, partSize: PART, expiresIn: 43200, completion: { uploadId: 'upload-1' } });
    });

    it('takes exactly one part at the part size, and two above it', async () => {
        expect((await startUpload(RECORDING, 'mp4', PART)).completion).toBeNull();
        expect((await startUpload(RECORDING, 'mp4', PART + 1)).parts).toHaveLength(2);
    });

    it('refuses a format that the kind does not take', async () => {
        await expect(startUpload({ cityId: 'argos', kind: 'decision' }, 'docx', 1000)).rejects.toThrow(BadRequestError);
        await expect(startUpload(RECORDING, 'pdf', 1000)).rejects.toThrow('An upload of kind recording takes mp4 or mov, not pdf');
    });

    it('refuses a size over the limit of the kind, and an empty or broken size', async () => {
        await expect(startUpload({ cityId: 'argos', kind: 'agenda' }, 'pdf', 21 * 1024 * 1024))
            .rejects.toThrow('An upload of kind agenda takes at most 20 MiB (20971520 bytes), not 22020096 bytes');
        await expect(startUpload(RECORDING, 'mp4', 41 * 1024 * PART)).rejects.toThrow(/at most 40 GiB/);
        await expect(startUpload(RECORDING, 'mp4', 41 * 1024 * PART)).rejects.toThrow(BadRequestError);
        await expect(startUpload(RECORDING, 'mp4', 0)).rejects.toThrow(BadRequestError);
        await expect(startUpload(RECORDING, 'mp4', 1.5)).rejects.toThrow(BadRequestError);
        expect(presignPut).not.toHaveBeenCalled();
        expect(startMultipartUpload).not.toHaveBeenCalled();
    });
});

describe('partsProblem', () => {
    const size = 2 * PART + 500;

    it('accepts full parts and a shorter last one', () => {
        expect(partsProblem([part(1, PART), part(2, PART), part(3, 500)], size)).toBeNull();
    });

    it('names the parts that are missing', () => {
        expect(partsProblem([part(1, PART)], size)).toMatch(/^Parts 2, 3 of 3 are missing\. Send them/);
        expect(partsProblem([part(1, PART), part(3, 500)], size)).toMatch(/^Part 2 of 3 is missing\. Send it/);
    });

    it('names the parts that have the wrong size', () => {
        expect(partsProblem([part(1, PART), part(2, PART - 1), part(3, 501)], size)).toMatch(/^Parts 2, 3 have the wrong size/);
        expect(partsProblem([part(1, PART), part(2, PART), part(3, 501)], size)).toMatch(/^Part 3 has the wrong size\. .* Send it again/);
    });

    it('refuses more parts than the file has', () => {
        expect(partsProblem([part(1, PART), part(2, PART), part(3, 500), part(4, 10)], size)).toMatch(/more than the 3/);
    });
});

describe('completeUpload', () => {
    const size = PART + 500;
    async function started() {
        const plan = await startUpload(RECORDING, 'mp4', size);
        if (!plan.completion) throw new Error('expected a multipart upload');
        return { key: plan.key, uploadId: plan.completion.uploadId, sizeBytes: size, token: plan.completion.token };
    }

    it('joins the parts that the bucket lists', async () => {
        const args = await started();
        (listUploadedParts as jest.Mock).mockResolvedValue([part(1, PART), part(2, 500)]);

        const result = await completeUpload(args);

        expect(completeMultipartUpload).toHaveBeenCalledWith(args.key, 'upload-1', [part(1, PART), part(2, 500)]);
        expect(result).toEqual({ key: args.key, publicUrl: `https://bucket.test/${args.key}`, sizeBytes: size });
    });

    it('refuses a token of another key, upload or size, before it reads the bucket', async () => {
        const args = await started();
        await expect(completeUpload({ ...args, key: 'uploads/argos_x_agenda_00000000.pdf' })).rejects.toThrow(ForbiddenError);
        await expect(completeUpload({ ...args, uploadId: 'upload-2' })).rejects.toThrow(ForbiddenError);
        await expect(completeUpload({ ...args, sizeBytes: size - 1 })).rejects.toThrow(ForbiddenError);
        expect(listUploadedParts).not.toHaveBeenCalled();
    });

    it('refuses to join parts that do not make up the file', async () => {
        const args = await started();
        (listUploadedParts as jest.Mock).mockResolvedValue([part(1, PART)]);
        await expect(completeUpload(args)).rejects.toThrow(/Part 2 of 2 is missing/);
        expect(completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('answers a second call as the first, when the upload is closed and the file is there', async () => {
        const args = await started();
        (listUploadedParts as jest.Mock).mockRejectedValue(notFound);
        (objectSize as jest.Mock).mockResolvedValue(size);
        await expect(completeUpload(args)).resolves.toMatchObject({ key: args.key, sizeBytes: size });
        expect(completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('returns success to both callers when completion races after both list the parts', async () => {
        const args = await started();
        let release: (() => void) | undefined;
        const bothListed = new Promise<void>(resolve => { release = resolve; });
        let listed = 0;
        jest.mocked(listUploadedParts).mockImplementation(async () => {
            if (++listed === 2) release?.();
            await bothListed;
            return [part(1, PART), part(2, 500)];
        });
        jest.mocked(completeMultipartUpload).mockResolvedValueOnce(undefined).mockRejectedValueOnce(notFound);
        jest.mocked(objectSize).mockResolvedValue(size);

        const results = await Promise.all([completeUpload(args), completeUpload(args)]);

        expect(results[0]).toEqual(results[1]);
        expect(results[0]).toMatchObject({ key: args.key, sizeBytes: size });
        expect(completeMultipartUpload).toHaveBeenCalledTimes(2);
    });

    it.each([null, size - 1])('refuses a completion race when the stored size is %s', async storedSize => {
        const args = await started();
        jest.mocked(listUploadedParts).mockResolvedValue([part(1, PART), part(2, 500)]);
        jest.mocked(completeMultipartUpload).mockRejectedValue(notFound);
        jest.mocked(objectSize).mockResolvedValue(storedSize);

        await expect(completeUpload(args)).rejects.toThrow(NotFoundError);
    });

    it('preserves other completion errors instead of treating them as success', async () => {
        const args = await started();
        const denied = Object.assign(new Error('AccessDenied'), { $metadata: { httpStatusCode: 403 } });
        jest.mocked(listUploadedParts).mockResolvedValue([part(1, PART), part(2, 500)]);
        jest.mocked(completeMultipartUpload).mockRejectedValue(denied);

        await expect(completeUpload(args)).rejects.toBe(denied);
        expect(objectSize).not.toHaveBeenCalled();
    });

    it('says so when there is neither an open upload nor the file', async () => {
        const args = await started();
        (listUploadedParts as jest.Mock).mockRejectedValue(notFound);
        (objectSize as jest.Mock).mockResolvedValue(null);
        await expect(completeUpload(args)).rejects.toThrow(NotFoundError);
    });
});
