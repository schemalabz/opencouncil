import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { isS3NotFound, isSubjectImageId, listStoredSubjectIds, objectKey, resolve, store } from '../store';

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

    it('tolerates a leading slash on the prefix', () => {
        expect(objectKey('abc', '/subject-images/8bit')).toBe('subject-images/8bit/abc.webp');
    });

    it('refuses an id that could leave the folder or break the URL', () => {
        for (const id of ['../../logo', 'a/b', 'a#b', 'a?v=1', 'a b', '']) {
            expect(isSubjectImageId(id)).toBe(false);
            expect(() => objectKey(id, 'subject-images/8bit')).toThrow('Not a subject image id');
        }
        expect(isSubjectImageId('clx1abc_DEF-9')).toBe(true);
    });
});

describe('isS3NotFound', () => {
    it('recognises the names and the status a missing object comes back with', () => {
        expect(isS3NotFound({ name: 'NotFound' })).toBe(true);
        expect(isS3NotFound({ name: 'NoSuchKey' })).toBe(true);
        expect(isS3NotFound({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    });

    it('is false for anything else', () => {
        expect(isS3NotFound({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })).toBe(false);
        expect(isS3NotFound(new TypeError('fetch failed'))).toBe(false);
        expect(isS3NotFound(null)).toBe(false);
        expect(isS3NotFound('nope')).toBe(false);
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

    it('treats a 403 as missing: a key without ListBucket answers that for an absent object', async () => {
        const send = jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }));
        expect(await resolve('abc', { ...deps, client: fakeClient(send) })).toBeNull();
    });

    it('rethrows a wrong region, a server error and a network error', async () => {
        for (const extra of [
            { name: 'PermanentRedirect', $metadata: { httpStatusCode: 301 } },
            { name: 'InternalError', $metadata: { httpStatusCode: 500 } },
            { name: 'TypeError' },
        ]) {
            const send = jest.fn().mockRejectedValue(Object.assign(new Error('broken'), extra));
            await expect(resolve('abc', { ...deps, client: fakeClient(send) })).rejects.toThrow('broken');
        }
    });
});

describe('resolve without a storage key', () => {
    const url = 'https://cdn.example/subject-images/8bit/abc.webp';

    function fakeFetch(answer: Response | Error): jest.Mock {
        return answer instanceof Error ? jest.fn().mockRejectedValue(answer) : jest.fn().mockResolvedValue(answer);
    }

    it('asks the public URL with an unsigned HEAD and uses its ETag as the cache-buster', async () => {
        const fetch = fakeFetch(new Response(null, { status: 200, headers: { ETag: '"etag123"' } }));
        const result = await resolve('abc', { ...deps, client: null, fetch });
        expect(result).toEqual({ url: `${url}?v=etag123` });
        expect(fetch).toHaveBeenCalledTimes(1);
        const [requested, init] = fetch.mock.calls[0];
        expect(requested).toMatch(new RegExp(`^${url}\\?lookup=[0-9a-f-]{36}$`));
        expect(init).toMatchObject({ method: 'HEAD', cache: 'no-store', redirect: 'manual' });
        expect(init.headers).toBeUndefined();
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    // The CDN keeps an object's answer for a year; a query it has not seen makes it ask the bucket.
    it('asks with a query no earlier lookup used, so the CDN cannot answer with a replaced image', async () => {
        const fetch = jest.fn().mockImplementation(async () => new Response(null, { status: 200, headers: { ETag: '"e"' } }));
        await resolve('abc', { ...deps, client: null, fetch });
        await resolve('abc', { ...deps, client: null, fetch });
        expect(fetch.mock.calls[0][0]).not.toBe(fetch.mock.calls[1][0]);
    });

    it('throws on a redirect rather than trust another origin', async () => {
        const fetch = fakeFetch(new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/x' } }));
        await expect(resolve('abc', { ...deps, client: null, fetch })).rejects.toThrow(`HEAD ${url} answered 302`);
    });

    it('drops the weak marker a proxy may add to the ETag', async () => {
        const fetch = fakeFetch(new Response(null, { status: 200, headers: { ETag: 'W/"etag123"' } }));
        expect(await resolve('abc', { ...deps, client: null, fetch })).toEqual({ url: `${url}?v=etag123` });
    });

    it('returns null for a 404, and for the 403 Spaces answers when the object is not there', async () => {
        for (const status of [404, 403]) {
            const fetch = fakeFetch(new Response(null, { status }));
            expect(await resolve('abc', { ...deps, client: null, fetch })).toBeNull();
        }
    });

    it('rethrows a server error and a network error', async () => {
        await expect(resolve('abc', { ...deps, client: null, fetch: fakeFetch(new Response(null, { status: 503 })) }))
            .rejects.toThrow(`HEAD ${url} answered 503`);
        const networkError = new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND cdn.example') });
        await expect(resolve('abc', { ...deps, client: null, fetch: fakeFetch(networkError) }))
            .rejects.toThrow(`HEAD ${url} failed: getaddrinfo ENOTFOUND cdn.example`);
        // A refused connection: an AggregateError with an empty message, and a code.
        const refused = new TypeError('fetch failed', { cause: Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' }) });
        await expect(resolve('abc', { ...deps, client: null, fetch: fakeFetch(refused) }))
            .rejects.toThrow(`HEAD ${url} failed: ECONNREFUSED`);
    });

    it('refuses a bad id before any request', async () => {
        const fetch = jest.fn();
        await expect(resolve('../../logo', { ...deps, client: null, fetch })).rejects.toThrow('Not a subject image id');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('never asks the public URL when a key is configured', async () => {
        const fetch = jest.fn();
        const send = jest.fn().mockResolvedValue({ ETag: '"etag123"' });
        await resolve('abc', { ...deps, client: fakeClient(send), fetch });
        expect(send).toHaveBeenCalledTimes(1);
        expect(fetch).not.toHaveBeenCalled();
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

describe('listStoredSubjectIds', () => {
    it('walks every page under the folder and keeps the ids of the .webp objects', async () => {
        const send = jest.fn()
            .mockResolvedValueOnce({
                Contents: [{ Key: 'subject-images/8bit/abc.webp' }, { Key: 'subject-images/8bit/' }, { Key: 'subject-images/8bit/notes.txt' }],
                IsTruncated: true,
                NextContinuationToken: 'page-2',
            })
            .mockResolvedValueOnce({ Contents: [{ Key: 'subject-images/8bit/def.webp' }], IsTruncated: false });

        const ids = await listStoredSubjectIds({ bucket: 'bucket', prefix: '/subject-images/8bit/', client: fakeClient(send) });

        expect([...ids].sort()).toEqual(['abc', 'def']);
        const first = send.mock.calls[0][0] as ListObjectsV2Command;
        expect(first).toBeInstanceOf(ListObjectsV2Command);
        expect(first.input).toEqual({ Bucket: 'bucket', Prefix: 'subject-images/8bit/', ContinuationToken: undefined });
        expect((send.mock.calls[1][0] as ListObjectsV2Command).input.ContinuationToken).toBe('page-2');
    });

    it('returns an empty set for an empty folder', async () => {
        const send = jest.fn().mockResolvedValue({ IsTruncated: false });
        expect((await listStoredSubjectIds({ bucket: 'bucket', prefix: 'subject-images/8bit', client: fakeClient(send) })).size).toBe(0);
    });
});
