jest.mock('@/env.mjs', () => ({
    env: {
        DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com',
        DO_SPACES_KEY: 'key',
        DO_SPACES_SECRET: 'secret',
        DO_SPACES_BUCKET: 'bucket',
    },
}));

import { bucketKeyOf, extractFileExtension, objectKey, objectKeyPrefix, presignGet, presignPart, presignPut } from '../s3';

const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

describe('objectKey', () => {
    it('starts every key of the same parts with objectKeyPrefix', () => {
        const prefix = objectKeyPrefix('uploads', ['chania', '../other', 'agenda']);
        expect(prefix).toBe('uploads/chania_-other_agenda_');
        expect(objectKey('uploads', ['chania', '../other', 'agenda'], 'pdf').startsWith(prefix)).toBe(true);
    });

    it('joins the parts and adds a random part', () => {
        expect(objectKey('uploads', ['chania', 'nov5_2026', 'agenda'], 'pdf')).toMatch(/^uploads\/chania_nov5_2026_agenda_[0-9a-f]{8}\.pdf$/);
    });

    it('names the file with a v4 UUID when there are no parts, and lowers the extension', () => {
        expect(objectKey('party-logos', [], 'PNG')).toMatch(new RegExp(`^party-logos/${UUID_V4}\\.png$`));
    });

    it('keeps a free-text part from moving the file to another folder', () => {
        expect(objectKey('uploads', ['chania', '../other/city', 'agenda'], 'pdf')).toMatch(/^uploads\/chania_-other-city_agenda_[0-9a-f]{8}\.pdf$/);
    });

    it('gives a different key on each call', () => {
        const keys = new Set(Array.from({ length: 50 }, () => objectKey('uploads', ['chania', 'agenda'], 'pdf')));
        expect(keys.size).toBe(50);
    });
});

describe('extractFileExtension', () => {
    it('falls back to bin when the name ends with a dot', () => {
        expect(extractFileExtension('file.')).toBe('bin');
    });
});

describe('signed URLs', () => {
    it('signs a whole-file PUT with the public ACL and the length of the file', async () => {
        const url = new URL(await presignPut('uploads/a.pdf', 'application/pdf', 1000, 300));
        expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
        expect(url.host).toBe('bucket.fra1.digitaloceanspaces.com');
        expect(url.pathname).toBe('/uploads/a.pdf');
        expect(url.searchParams.get('x-amz-acl')).toBe('public-read');
        expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    });

    it('signs a private PUT without an ACL', async () => {
        const url = new URL(await presignPut('uploads/a.pdf', 'application/pdf', 1000, 300, { publicRead: false }));
        expect(url.searchParams.get('x-amz-acl')).toBeNull();
        expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
    });

    it('signs a GET of a file in our bucket', async () => {
        const url = new URL(await presignGet('uploads/a_minutes_0a1b2c3d.pdf', 86400));
        expect(url.host).toBe('bucket.fra1.digitaloceanspaces.com');
        expect(url.pathname).toBe('/uploads/a_minutes_0a1b2c3d.pdf');
        expect(url.searchParams.get('X-Amz-Expires')).toBe('86400');
        expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    });

    it('reads a key only from a URL of our bucket', () => {
        expect(bucketKeyOf('https://bucket.fra1.digitaloceanspaces.com/uploads/a.pdf')).toBe('uploads/a.pdf');
        expect(bucketKeyOf('https://other.fra1.digitaloceanspaces.com/uploads/a.pdf')).toBeNull();
        expect(bucketKeyOf('https://bucket.fra1.digitaloceanspaces.com/')).toBeNull();
        expect(bucketKeyOf('not a url')).toBeNull();
    });

    it('signs one part of a multipart upload, with the length of the part', async () => {
        const url = new URL(await presignPart('uploads/a.mp4', 'upload-1', 3, 1024, 43200));
        expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
        expect(url.searchParams.get('uploadId')).toBe('upload-1');
        expect(url.searchParams.get('partNumber')).toBe('3');
        expect(url.searchParams.get('X-Amz-Expires')).toBe('43200');
    });
});
