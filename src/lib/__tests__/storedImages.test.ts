/** @jest-environment node */
import sharp from 'sharp';

const mockUploadFile = jest.fn();
const mockDeleteFile = jest.fn();
const mockStorageConfigured = jest.fn(() => true);
const mockPublicUrl = jest.fn((bucket: string, key: string) => `https://${bucket}.fra1.digitaloceanspaces.com/${key}`);
jest.mock('@/lib/s3', () => ({
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
    isStorageConfigured: () => mockStorageConfigured(),
    constructPublicUrl: (bucket: string, key: string) => mockPublicUrl(bucket, key),
}));
jest.mock('@/env.mjs', () => ({ env: { DO_SPACES_BUCKET: 'townhalls-gr' } }));

import { deleteStoredImages, imageStorageProblem, RemoteImageError, StoredImageWriteError, storeRemoteImage } from '@/lib/storedImages';
import { isStoredImageUrl } from '@/lib/utils/storedImageUrl';
import { IMAGE_STORAGE_HOSTS } from '@/lib/utils/storageHosts.cjs';
import { MAX_IMAGE_BYTES } from '@/lib/utils/imageUpload';

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
let PNG: Buffer, JPEG: Buffer, WEBP: Buffer, GIF: Buffer, NOISY_PNG: Buffer, NOISY_JPEG: Buffer;
beforeAll(async () => {
    const image = () => sharp({ create: { width: 40, height: 40, channels: 3, background: '#3a7' } });
    [PNG, JPEG, WEBP, GIF] = await Promise.all([image().png().toBuffer(), image().jpeg().toBuffer(), image().webp().toBuffer(), image().gif().toBuffer()]);
    // A flat image cut short loses its header tables and fails at any setting;
    // a noisy one cut at 90% decodes unless sharp is told to fail on errors.
    const noise = () => sharp(Buffer.from(Array.from({ length: 400 * 400 * 3 }, () => Math.floor(Math.random() * 256))), { raw: { width: 400, height: 400, channels: 3 } });
    [NOISY_PNG, NOISY_JPEG] = await Promise.all([noise().png().toBuffer(), noise().jpeg().toBuffer()]);
});

const mockFetch = jest.fn();
beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockUploadFile.mockImplementation(async (_file: File, { prefix }: { prefix: string }) => ({ url: `https://data.opencouncil.gr/${prefix}/x`, key: `${prefix}/x`, filename: 'x' }));
});

const answer = (body: Buffer, init: ResponseInit = {}) => new Response(new Uint8Array(body), { status: 200, ...init });
const originalFetch = global.fetch;
afterAll(() => { global.fetch = originalFetch; });

describe('isStoredImageUrl', () => {
    it.each(IMAGE_STORAGE_HOSTS)('accepts %s', (host) => {
        expect(isStoredImageUrl(`https://${host}/person-images/a.jpg`)).toBe(true);
    });

    it('refuses any other host, and a string that is not a URL', () => {
        expect(isStoredImageUrl('https://www.sandiego.gov/sites/default/files/a.jpg')).toBe(false);
        expect(isStoredImageUrl('not a url')).toBe(false);
    });

    it('refuses our hosts over http, with credentials or with a port, as the share images do', () => {
        expect(isStoredImageUrl('http://data.opencouncil.gr/a.jpg')).toBe(false);
        expect(isStoredImageUrl('https://u:p@data.opencouncil.gr/a.jpg')).toBe(false);
        expect(isStoredImageUrl('https://data.opencouncil.gr:8443/a.jpg')).toBe(false);
    });
});

describe('imageStorageProblem', () => {
    it('is null for a bucket that the site draws from', () => {
        expect(imageStorageProblem()).toBeNull();
    });

    it('names missing storage keys', () => {
        mockStorageConfigured.mockReturnValueOnce(false);
        expect(imageStorageProblem()).toMatch(/no storage keys/);
    });

    it('names a bucket that the site does not draw from', () => {
        mockPublicUrl.mockReturnValueOnce('https://opencouncil-previews.fra1.digitaloceanspaces.com/probe');
        expect(imageStorageProblem()).toMatch(/is not served from a host the site draws/);
    });
});

describe('storeRemoteImage', () => {
    it('copies a photo into the folder of its kind, with the type read from the bytes', async () => {
        mockFetch.mockResolvedValue(answer(JPEG, { headers: { 'content-type': 'application/octet-stream' } }));
        const stored = await storeRemoteImage('https://www.sandiego.gov/sites/default/files/a.jpg', 'personImage');
        expect(stored).toEqual({ url: 'https://data.opencouncil.gr/person-images/x', key: 'person-images/x', filename: 'x' });
        const [file, options] = mockUploadFile.mock.calls[0];
        expect(options).toEqual({ prefix: 'person-images' });
        expect(file.type).toBe('image/jpeg');
        expect(file.name).toBe('image.jpeg');
        expect(Buffer.from(await file.arrayBuffer())).toEqual(JPEG);
        expect(mockFetch).toHaveBeenCalledWith('https://www.sandiego.gov/sites/default/files/a.jpg', expect.objectContaining({ redirect: 'error' }));
    });

    it('returns a URL that is already on our storage without fetching it', async () => {
        const url = 'https://townhalls-gr.fra1.digitaloceanspaces.com/person-images/a.jpg';
        await expect(storeRemoteImage(url, 'personImage')).resolves.toEqual({ url, key: null });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each([
        ['http://example.com/a.png', /only https/],
        ['https://user:pw@example.com/a.png', /credentials or a port/],
        ['https://example.com:8443/a.png', /credentials or a port/],
        ['https://localhost/a.png', /public domain name/],
        ['https://localhost./a.png', /public domain name/],
        ['https://printer.local/a.png', /public domain name/],
        ['https://app.localhost/a.png', /public domain name/],
        ['https://postgres/a.png', /public domain name/],
        ['https://10.0.0.5/a.png', /public domain name/],
        ['https://[::1]/a.png', /public domain name/],
        ['https://metadata.internal/a.png', /public domain name/],
    ])('refuses %s before any request', async (url, reason) => {
        await expect(storeRemoteImage(url, 'personImage')).rejects.toThrow(reason);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refuses a logo that is not PNG or JPEG, and a file of no image type for every kind', async () => {
        mockFetch.mockResolvedValue(answer(WEBP));
        await expect(storeRemoteImage('https://example.com/logo.webp', 'partyLogo')).rejects.toThrow(/image\/webp; accepted: image\/png, image\/jpeg/);
        mockFetch.mockResolvedValue(answer(GIF));
        await expect(storeRemoteImage('https://example.com/a.gif', 'personImage')).rejects.toThrow(/image\/gif; accepted: image\/png, image\/jpeg, image\/webp/);
        mockFetch.mockResolvedValue(answer(SVG, { headers: { 'content-type': 'image/svg+xml' } }));
        await expect(storeRemoteImage('https://example.com/a.svg', 'personImage')).rejects.toThrow(/not a JPEG, PNG, WebP, GIF or AVIF image/);
        expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('refuses an answer that is not 2xx, a declared length over the limit, and a body that runs over it', async () => {
        mockFetch.mockImplementation(async () => answer(PNG, { status: 403 }));
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(/the host answered HTTP 403/);
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(RemoteImageError);
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.not.toThrow(/try again/);
        mockFetch.mockResolvedValue(answer(PNG, { headers: { 'content-length': String(MAX_IMAGE_BYTES + 1) } }));
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(/larger than 5 MB/);
        mockFetch.mockResolvedValue(answer(Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)])));
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(/larger than 5 MB/);
        expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('refuses a URL that redirects, since a redirect could lead past the host checks', async () => {
        mockFetch.mockRejectedValue(new TypeError('fetch failed', { cause: new Error('unexpected redirect') }));
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(/redirects; pass the URL it redirects to/);
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/a.png', expect.objectContaining({ redirect: 'error' }));
    });

    it('refuses a file whose header says image and whose body is not one', async () => {
        mockFetch.mockResolvedValue(answer(Buffer.concat([PNG.subarray(0, 33), Buffer.from('<html>not the rest of a PNG</html>')])));
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(/the image\/png could not be read/);
        mockFetch.mockResolvedValue(answer(JPEG.subarray(0, Math.floor(JPEG.length / 2))));
        await expect(storeRemoteImage('https://example.com/a.jpg', 'personImage')).rejects.toThrow(/the image\/jpeg could not be read/);
        mockFetch.mockResolvedValue(answer(Buffer.alloc(0), { headers: { 'content-type': 'image/png' } }));
        await expect(storeRemoteImage('https://example.com/empty.png', 'personImage')).rejects.toThrow(/not a JPEG, PNG/);
        expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('refuses a small file that decodes past the pixel limit', async () => {
        const bomb = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer();
        expect(bomb.length).toBeLessThan(1024 * 1024);
        mockFetch.mockResolvedValue(answer(bomb));
        await expect(storeRemoteImage('https://example.com/bomb.png', 'personImage')).rejects.toThrow(/pixel limit/);
        expect(mockUploadFile).not.toHaveBeenCalled();
    });

    const failedFetch = (code: string, message: string) => new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) });

    it.each([
        ['a timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError'), /no answer within 15 s \(this may pass if you try again\)/],
        ['a reset connection', failedFetch('ECONNRESET', 'read ECONNRESET'), /read ECONNRESET\) \(this may pass if you try again\)/],
        ['a DNS lookup that may pass later', failedFetch('EAI_AGAIN', 'getaddrinfo EAI_AGAIN example.com'), /EAI_AGAIN example\.com\) \(this may pass/],
    ])('says that %s may pass on a second try', async (_, error, message) => {
        mockFetch.mockRejectedValue(error);
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(RemoteImageError);
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(message);
    });

    it.each([
        ['an unknown host', failedFetch('ENOTFOUND', 'getaddrinfo ENOTFOUND no-such.example')],
        ['an expired certificate', failedFetch('CERT_HAS_EXPIRED', 'certificate has expired')],
        ['a failure with no code', new TypeError('fetch failed')],
    ])('does not promise that %s passes on a second try', async (_, error) => {
        mockFetch.mockRejectedValue(error);
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(/could not be fetched \(fetch failed/);
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.not.toThrow(/try again/);
    });

    it.each([429, 500, 503])('says that HTTP %i may pass on a second try', async (status) => {
        mockFetch.mockImplementation(async () => answer(PNG, { status }));
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(`the host answered HTTP ${status} (this may pass if you try again)`);
    });

    it('refuses a file damaged after a valid start, which decodes only when errors are ignored', async () => {
        for (const [image, type] of [[NOISY_PNG, 'png'], [NOISY_JPEG, 'jpeg']] as const) {
            mockFetch.mockResolvedValue(answer(image.subarray(0, Math.floor(image.length * 0.9))));
            await expect(storeRemoteImage(`https://example.com/a.${type}`, 'personImage')).rejects.toThrow(`the image/${type} could not be read`);
        }
        expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('marks a storage failure as a StoredImageWriteError, with the cause kept', async () => {
        mockFetch.mockImplementation(async () => answer(PNG));
        const cause = new Error('Storage needs DO_SPACES_KEY');
        mockUploadFile.mockRejectedValue(cause);
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toThrow(StoredImageWriteError);
        await expect(storeRemoteImage('https://example.com/a.png', 'personImage')).rejects.toMatchObject({ message: 'Storage needs DO_SPACES_KEY', cause });
    });
});

describe('deleteStoredImages', () => {
    it('deletes every key from the bucket, and logs a failed delete instead of throwing', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockDeleteFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('gone'));
        await expect(deleteStoredImages(['person-images/a.jpeg', 'person-images/b.jpeg'])).resolves.toBeUndefined();
        expect(mockDeleteFile.mock.calls).toEqual([['townhalls-gr', 'person-images/a.jpeg'], ['townhalls-gr', 'person-images/b.jpeg']]);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('person-images/b.jpeg'), expect.any(Error));
        error.mockRestore();
    });
});
