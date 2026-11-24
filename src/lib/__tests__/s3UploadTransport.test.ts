import { Readable } from 'node:stream';
import { objectSize, s3Client, uploadFile } from '@/lib/s3';

jest.mock('@/env.mjs', () => ({
    env: {
        DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com',
        DO_SPACES_KEY: 'fixture-key',
        DO_SPACES_SECRET: 'fixture-secret',
        DO_SPACES_BUCKET: 'fixture-bucket',
    },
}));

function s3Response(statusCode: number, xml = '', headers: Record<string, string> = {}) {
    return { response: { statusCode, headers, body: Readable.from([Buffer.from(xml)]) } };
}

afterEach(() => jest.restoreAllMocks());

test('a small app upload uses a signed public PUT with the correct content type and bytes', async () => {
    const handle = jest.spyOn(s3Client.config.requestHandler, 'handle')
        .mockResolvedValue(s3Response(200, '', { etag: '"fixture"' }));
    const file = new File(['fixture content'], 'agenda.pdf', { type: 'application/pdf' });
    const result = await uploadFile(file);
    expect(result.url).toBe(`https://fixture-bucket.fra1.digitaloceanspaces.com/${result.key}`);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0][0]).toMatchObject({
        method: 'PUT',
        hostname: 'fixture-bucket.fra1.digitaloceanspaces.com',
        path: `/${result.key}`,
        headers: {
            authorization: expect.stringContaining('Credential=fixture-key/'),
            'content-length': '15',
            'content-type': 'application/pdf',
            'x-amz-acl': 'public-read',
        },
        body: Buffer.from('fixture content'),
    });
});

test('an app multipart upload sends parts and completes using their returned ETags', async () => {
    const handle = jest.spyOn(s3Client.config.requestHandler, 'handle')
        .mockImplementation(async (request) => {
            if (request.method === 'POST' && request.query?.uploads !== undefined) {
                return s3Response(200, '<InitiateMultipartUploadResult><UploadId>fixture-id</UploadId></InitiateMultipartUploadResult>');
            }
            if (request.method === 'PUT' && request.query?.partNumber !== undefined) {
                return s3Response(200, '', { etag: `"fixture-${request.query.partNumber}"` });
            }
            if (request.method === 'POST' && request.query?.uploadId === 'fixture-id') {
                return s3Response(200, '<CompleteMultipartUploadResult><ETag>fixture-complete</ETag></CompleteMultipartUploadResult>');
            }
            throw new Error('Unexpected S3 request');
        });
    const file = new File([Buffer.alloc(6 * 1024 * 1024)], 'recording.mp4', { type: 'video/mp4' });
    await uploadFile(file);
    const requests = handle.mock.calls.map(([request]) => request);
    expect(requests.map(request => request.method)).toEqual(['POST', 'PUT', 'PUT', 'POST']);
    expect(requests.slice(1, 3).map(request => Number(request.headers['content-length'])).sort())
        .toEqual([1024 * 1024, 5 * 1024 * 1024]);
    expect(String(requests[3].body)).toContain('&quot;fixture-1&quot;');
    expect(String(requests[3].body)).toContain('&quot;fixture-2&quot;');
});

test('objectSize returns null for a missing object and reports a forbidden request', async () => {
    jest.spyOn(s3Client.config.requestHandler, 'handle')
        .mockResolvedValueOnce(s3Response(404))
        .mockResolvedValueOnce(s3Response(403));
    await expect(objectSize('absent')).resolves.toBeNull();
    await expect(objectSize('forbidden')).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
});

test('reports completion failure and aborts the multipart upload', async () => {
    const handle = jest.spyOn(s3Client.config.requestHandler, 'handle')
        .mockImplementation(async (request) => {
            if (request.method === 'POST' && request.query?.uploads !== undefined) {
                return s3Response(200, '<InitiateMultipartUploadResult><UploadId>fixture-id</UploadId></InitiateMultipartUploadResult>');
            }
            if (request.method === 'PUT' && request.query?.partNumber !== undefined) {
                return s3Response(200, '', { etag: `"fixture-${request.query.partNumber}"` });
            }
            if (request.method === 'POST' && request.query?.uploadId === 'fixture-id') {
                throw new Error('Fixture completion failure');
            }
            if (request.method === 'DELETE' && request.query?.uploadId === 'fixture-id') {
                return s3Response(204);
            }
            throw new Error('Unexpected S3 request');
        });
    const file = new File([Buffer.alloc(6 * 1024 * 1024)], 'recording.mp4', { type: 'video/mp4' });

    await expect(uploadFile(file)).rejects.toThrow('Fixture completion failure');
    const aborts = handle.mock.calls.filter(([request]) => request.method === 'DELETE');
    expect(aborts).toHaveLength(1);
});
