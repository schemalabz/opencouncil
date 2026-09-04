import { HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { objectKey, resolve, store } from '../store';

function fakeClient(send: jest.Mock): S3Client {
    return { send } as unknown as S3Client;
}

const deps = { bucket: 'bucket', prefix: 'subject-images/8bit', publicBaseUrl: 'https://cdn.example' };

describe('objectKey', () => {
    it('puts the image under the configured style folder', () => {
        expect(objectKey('abc', 'subject-images/8bit')).toBe('subject-images/8bit/abc.webp');
    });

    it('tolerates a trailing slash on the prefix', () => {
        expect(objectKey('abc', 'subject-images/8bit/')).toBe('subject-images/8bit/abc.webp');
    });
});

describe('resolve', () => {
    it('returns the public URL with the ETag as a cache-buster', async () => {
        const send = jest.fn().mockResolvedValue({ ETag: '"etag123"' });
        const result = await resolve('abc', { ...deps, client: fakeClient(send) });
        expect(result).toEqual({ url: 'https://cdn.example/subject-images/8bit/abc.webp?v=etag123' });
        const command = send.mock.calls[0][0] as HeadObjectCommand;
        expect(command).toBeInstanceOf(HeadObjectCommand);
        expect(command.input).toEqual({ Bucket: 'bucket', Key: 'subject-images/8bit/abc.webp' });
    });

    it('returns null when the object does not exist', async () => {
        const send = jest.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotFound' }));
        expect(await resolve('abc', { ...deps, client: fakeClient(send) })).toBeNull();
    });

    it('treats a 404 status as missing too', async () => {
        const send = jest.fn().mockRejectedValue(Object.assign(new Error('nope'), { $metadata: { httpStatusCode: 404 } }));
        expect(await resolve('abc', { ...deps, client: fakeClient(send) })).toBeNull();
    });

    it('rethrows other errors', async () => {
        const send = jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
        await expect(resolve('abc', { ...deps, client: fakeClient(send) })).rejects.toThrow('denied');
    });
});

describe('store', () => {
    it('writes a public WebP object at the subject key', async () => {
        const send = jest.fn().mockResolvedValue({});
        const image = Buffer.from('webp');
        await store('abc', image, { bucket: 'bucket', prefix: 'subject-images/8bit', client: fakeClient(send) });
        const command = send.mock.calls[0][0] as PutObjectCommand;
        expect(command).toBeInstanceOf(PutObjectCommand);
        expect(command.input).toMatchObject({
            Bucket: 'bucket',
            Key: 'subject-images/8bit/abc.webp',
            Body: image,
            ContentType: 'image/webp',
            ACL: 'public-read',
        });
    });
});
