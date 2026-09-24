/** @jest-environment node */

import { generateImageForSubject, generateImagesForMeeting, isSubjectImageGenerationEnabled, listSubjectsWithImages, reportLookupFailure, resolveSubjectImage, storeSubjectImage } from '@/lib/subjectImages';

const mockEnv: { GEMINI_API_KEY?: string; DO_SPACES_BUCKET: string; SUBJECT_IMAGES_PREFIX: string; CDN_URL: string } = {
    GEMINI_API_KEY: 'gemini-key',
    DO_SPACES_BUCKET: 'bucket',
    SUBJECT_IMAGES_PREFIX: 'subject-images/8bit',
    CDN_URL: 'https://cdn.example//',
};
// A getter: the imports above run before mockEnv is initialised, and the service reads env at call time.
jest.mock('@/env.mjs', () => ({ get env() { return mockEnv; } }));

jest.mock('@/lib/s3', () => ({ s3Client: { send: jest.fn() } }));

const mockSendErrorAdminAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/discord-core', () => ({
    sendErrorAdminAlert: (...args: unknown[]) => mockSendErrorAdminAlert(...args),
}));

const mockGetSubjectPromptInput = jest.fn();
const mockGetSubjectIdsForMeeting = jest.fn();
jest.mock('@/lib/db/subject', () => ({
    getSubjectPromptInput: (...args: unknown[]) => mockGetSubjectPromptInput(...args),
    getSubjectIdsForMeeting: (...args: unknown[]) => mockGetSubjectIdsForMeeting(...args),
}));

// Valkey as a map: the value and the TTL each write asked for. `mockCacheDown`
// makes a claim fail the way an outage does; `mockCacheConfigured` says whether
// CACHE_URL names a Valkey at all.
const mockCache = new Map<string, { value: string; ttl: number }>();
let mockCacheDown = false;
let mockCacheConfigured = true;
jest.mock('@/lib/cache/valkey', () => ({
    isCacheConfigured: () => mockCacheConfigured,
    cacheGetJSON: async (key: string) => {
        const entry = mockCache.get(key);
        return entry ? JSON.parse(entry.value) : null;
    },
    cacheSetJSON: async (key: string, value: unknown, ttl: number) => {
        mockCache.set(key, { value: JSON.stringify(value), ttl });
        return true;
    },
    cacheAcquire: async (key: string, ttl: number) => {
        if (mockCacheDown) return 'unavailable';
        if (mockCache.has(key)) return 'held';
        mockCache.set(key, { value: '1', ttl });
        return 'acquired';
    },
    cacheDelete: async (key: string) => { mockCache.delete(key); },
}));

const mockResolve = jest.fn();
const mockStore = jest.fn().mockResolvedValue(undefined);
const mockListStoredSubjectIds = jest.fn();
const mockGenerate = jest.fn();
const mockToWebp = jest.fn(async (b: Buffer) => b);
jest.mock('@opencouncil/subject-images', () => ({
    // The pure helpers stay real: the URL builder under test relies on the id guard and the key layout.
    ...jest.requireActual('@opencouncil/subject-images'),
    buildPrompt: ({ title, description, city, country }: { title: string; description: string; city: string; country: string }) => `${title}|${description}|${city}, ${country}`,
    generate: (...args: unknown[]) => mockGenerate(...args),
    listStoredSubjectIds: (...args: unknown[]) => mockListStoredSubjectIds(...args),
    resolve: (...args: unknown[]) => mockResolve(...args),
    store: (...args: unknown[]) => mockStore(...args),
    toWebp: (b: Buffer) => mockToWebp(b),
}));

const image = Buffer.from('webp');
const athens = { councilMeeting: { city: { name: 'Αθήνα', name_en: 'Athens', realm: 'greece' } } };
const DAY_S = 24 * 60 * 60;
const MINUTE_MS = 60 * 1000;

/** A generation that finishes only when the test says so. */
function slowGeneration() {
    let finish: (value: Buffer) => void = () => {};
    let fail: (error: Error) => void = () => {};
    mockGenerate.mockReturnValueOnce(new Promise<Buffer>((resolve, reject) => { finish = resolve; fail = reject; }));
    return { finish: (value: Buffer) => finish(value), fail: (error: Error) => fail(error) };
}

/** Lets a pending call reach its next await. */
const settle = () => new Promise<void>((done) => setImmediate(done));

beforeEach(() => {
    jest.clearAllMocks();
    mockCache.clear();
    mockEnv.GEMINI_API_KEY = 'gemini-key';
    mockResolve.mockResolvedValue(null);
    mockGenerate.mockResolvedValue(image);
    mockCacheDown = false;
    mockCacheConfigured = true;
    mockGetSubjectPromptInput.mockResolvedValue({ name: 'Title', description: 'Desc', ...athens });
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.useRealTimers();
});

describe('resolveSubjectImage', () => {
    it('passes the bucket, the folder and the CDN origin without its trailing slashes', async () => {
        await resolveSubjectImage('s1');
        expect(mockResolve).toHaveBeenCalledWith('s1', expect.objectContaining({
            bucket: 'bucket',
            prefix: 'subject-images/8bit',
            publicBaseUrl: 'https://cdn.example',
        }));
    });
});

describe('storeSubjectImage', () => {
    it('normalises the upload to WebP before storing', async () => {
        const raw = Buffer.from('png');
        await storeSubjectImage('s1', raw);
        expect(mockToWebp).toHaveBeenCalledWith(raw);
        expect(mockStore).toHaveBeenCalledWith('s1', raw, expect.objectContaining({ bucket: 'bucket', prefix: 'subject-images/8bit' }));
    });
});

describe('listSubjectsWithImages', () => {
    it('lists the folder of this environment', async () => {
        mockListStoredSubjectIds.mockResolvedValue(new Set(['s1']));
        expect(await listSubjectsWithImages()).toEqual(new Set(['s1']));
        expect(mockListStoredSubjectIds).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'bucket', prefix: 'subject-images/8bit' }));
    });
});

describe('generateImageForSubject', () => {
    it('is disabled without a Gemini key', async () => {
        mockEnv.GEMINI_API_KEY = undefined;
        expect(isSubjectImageGenerationEnabled()).toBe(false);
        expect(await generateImageForSubject('s1')).toBe('disabled');
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('generates from the subject title and description, set in its city, then stores', async () => {
        expect(await generateImageForSubject('s1')).toBe('generated');
        expect(mockGenerate).toHaveBeenCalledWith('Title|Desc|Athens, Greece', { apiKey: 'gemini-key' });
        expect(mockStore).toHaveBeenCalledWith('s1', image, expect.objectContaining({ bucket: 'bucket' }));
    });

    it('strips markdown and reference links before prompting', async () => {
        mockGetSubjectPromptInput.mockResolvedValue({
            name: '**Βλάβη**',
            description: 'Εισήγηση [επί αποτελέσματος](REF:UTTERANCE:abc123) διαγωνισμού.',
            ...athens,
        });
        await generateImageForSubject('s1');
        expect(mockGenerate).toHaveBeenCalledWith('Βλάβη|Εισήγηση επί αποτελέσματος διαγωνισμού.|Athens, Greece', { apiKey: 'gemini-key' });
    });

    it('names a city of another realm in its own country', async () => {
        mockGetSubjectPromptInput.mockResolvedValue({ name: 'Rue', description: 'Travaux.', councilMeeting: { city: { name: 'Λυών', name_en: 'Lyon', realm: 'france' } } });
        await generateImageForSubject('s1');
        expect(mockGenerate).toHaveBeenCalledWith('Rue|Travaux.|Lyon, France', { apiKey: 'gemini-key' });
    });

    it('skips a subject that already has an image', async () => {
        mockResolve.mockResolvedValue({ url: 'https://cdn.example/x.webp?v=1' });
        expect(await generateImageForSubject('s1')).toBe('exists');
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('replaces an existing image when forced', async () => {
        mockResolve.mockResolvedValue({ url: 'https://cdn.example/x.webp?v=1' });
        expect(await generateImageForSubject('s1', { force: true })).toBe('generated');
        expect(mockStore).toHaveBeenCalled();
    });

    it('keeps an upload that landed while the model drew', async () => {
        mockResolve.mockResolvedValueOnce(null).mockResolvedValueOnce({ url: 'https://cdn.example/x.webp?v=upload' });
        expect(await generateImageForSubject('s1')).toBe('superseded');
        expect(mockGenerate).toHaveBeenCalledTimes(1);
        expect(mockStore).not.toHaveBeenCalled();
    });

    it('keeps a write that landed during a forced run too', async () => {
        mockResolve
            .mockResolvedValueOnce({ url: 'https://cdn.example/x.webp?v=old' })
            .mockResolvedValueOnce({ url: 'https://cdn.example/x.webp?v=upload' });
        expect(await generateImageForSubject('s1', { force: true })).toBe('superseded');
        expect(mockStore).not.toHaveBeenCalled();
    });

    it('pauses every generation for a while after the bucket refused a write', async () => {
        mockStore.mockRejectedValueOnce(Object.assign(new Error('NoSuchBucket'), { name: 'NoSuchBucket' }));
        await expect(generateImageForSubject('s1')).rejects.toThrow('NoSuchBucket');
        expect(mockCache.get('subject-images:store-broken')?.ttl).toBe(600);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
        // The bucket's failure is not the subject's: its failure budget is untouched.
        expect(mockCache.has('subject-images:failed:s1')).toBe(false);

        expect(await generateImageForSubject('s2')).toBe('store-unavailable');
        expect(mockGenerate).toHaveBeenCalledTimes(1);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);

        expect(await generateImageForSubject('s3', { force: true })).toBe('generated');
    });

    it('pauses every generation for an hour after a quota 429, without blaming the subject', async () => {
        mockGenerate.mockRejectedValueOnce(Object.assign(new Error('{"error":{"code":429,"message":"You exceeded your current quota"}}'), { status: 429 }));
        await expect(generateImageForSubject('s1')).rejects.toThrow('429');
        expect(mockCache.has('subject-images:failed:s1')).toBe(false);
        expect(mockCache.get('subject-images:quota-exhausted')?.ttl).toBe(3600);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);

        expect(await generateImageForSubject('s2')).toBe('quota-exhausted');
        expect(mockGenerate).toHaveBeenCalledTimes(1);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
    });

    it('releases its claim after the run, success or not', async () => {
        await generateImageForSubject('s1');
        expect(mockCache.has('subject-images:in-flight:s1')).toBe(false);

        mockGenerate.mockRejectedValueOnce(new Error('quota'));
        await expect(generateImageForSubject('s2')).rejects.toThrow('quota');
        expect(mockCache.has('subject-images:in-flight:s2')).toBe(false);
    });

    it('alerts, rethrows, and holds off a retry after a failure', async () => {
        mockGenerate.mockRejectedValueOnce(new Error('quota'));
        await expect(generateImageForSubject('s-fail')).rejects.toThrow('quota');
        expect(mockSendErrorAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
            source: 'subject-images',
            error: 'quota',
            context: { subjectId: 's-fail', attempt: '1' },
        }));
        expect(mockCache.get('subject-images:failed:s-fail')?.ttl).toBe(DAY_S);

        expect(await generateImageForSubject('s-fail')).toBe('recent-failure');
        expect(mockGenerate).toHaveBeenCalledTimes(1);

        expect(await generateImageForSubject('s-fail', { force: true })).toBe('generated');
        expect(mockCache.has('subject-images:failed:s-fail')).toBe(false);
    });

    it('retries after the back-off, and gives up after three failures in a row', async () => {
        jest.useFakeTimers();
        mockGenerate.mockRejectedValue(new Error('refused'));

        await expect(generateImageForSubject('s-bad')).rejects.toThrow('refused');
        jest.advanceTimersByTime(11 * MINUTE_MS);
        await expect(generateImageForSubject('s-bad')).rejects.toThrow('refused');
        jest.advanceTimersByTime(11 * MINUTE_MS);
        await expect(generateImageForSubject('s-bad')).rejects.toThrow('refused');
        expect(mockGenerate).toHaveBeenCalledTimes(3);
        expect(mockCache.get('subject-images:failed:s-bad')?.ttl).toBe(30 * DAY_S);
        expect(mockSendErrorAdminAlert).toHaveBeenLastCalledWith(expect.objectContaining({
            context: { subjectId: 's-bad', attempt: '3' },
        }));

        jest.advanceTimersByTime(11 * MINUTE_MS);
        expect(await generateImageForSubject('s-bad')).toBe('refused');
        expect(mockGenerate).toHaveBeenCalledTimes(3);

        mockGenerate.mockResolvedValue(image);
        expect(await generateImageForSubject('s-bad', { force: true })).toBe('generated');
        expect(mockCache.has('subject-images:failed:s-bad')).toBe(false);
    });

    it('reports a subject this process is already drawing', async () => {
        const slow = slowGeneration();
        const first = generateImageForSubject('s-slow');
        await settle();
        expect(await generateImageForSubject('s-slow')).toBe('in-flight');

        slow.finish(image);
        expect(await first).toBe('generated');
    });

    it('makes a forced call wait for the running one here, then draw again', async () => {
        const slow = slowGeneration();
        const first = generateImageForSubject('s-slow');
        let forcedSettled = false;
        const forced = generateImageForSubject('s-slow', { force: true }).finally(() => { forcedSettled = true; });
        await settle();
        expect(forcedSettled).toBe(false);
        expect(mockGenerate).toHaveBeenCalledTimes(1);

        slow.finish(image);
        expect(await first).toBe('generated');
        expect(await forced).toBe('generated');
        expect(mockGenerate).toHaveBeenCalledTimes(2);
    });

    it('lets a forced call draw after the running one failed', async () => {
        const slow = slowGeneration();
        const first = generateImageForSubject('s-flaky');
        const forced = generateImageForSubject('s-flaky', { force: true });

        slow.fail(new Error('quota'));
        await expect(first).rejects.toThrow('quota');
        expect(await forced).toBe('generated');
    });

    it('reports a subject another container is drawing', async () => {
        mockCache.set('subject-images:in-flight:s-there', { value: '1', ttl: 180 });
        expect(await generateImageForSubject('s-there')).toBe('in-flight');
        expect(mockGenerate).not.toHaveBeenCalled();
        expect(mockCache.has('subject-images:in-flight:s-there')).toBe(true);
    });

    it('stands down when Valkey is configured but cannot record the claim', async () => {
        mockCacheDown = true;
        expect(await generateImageForSubject('s1')).toBe('unguarded');
        expect(await generateImageForSubject('s1', { force: true })).toBe('unguarded');
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('draws on its own in-process guard when no Valkey is configured', async () => {
        mockCacheDown = true;
        mockCacheConfigured = false;
        expect(await generateImageForSubject('s1')).toBe('generated');
        const slow = slowGeneration();
        const first = generateImageForSubject('s-slow');
        await settle();
        expect(await generateImageForSubject('s-slow')).toBe('in-flight');
        slow.finish(image);
        expect(await first).toBe('generated');
    });

    it("makes a forced call wait for another container's claim", async () => {
        jest.useFakeTimers();
        mockCache.set('subject-images:in-flight:s-there', { value: '1', ttl: 180 });
        let settled = false;
        const forced = generateImageForSubject('s-there', { force: true }).finally(() => { settled = true; });

        await jest.advanceTimersByTimeAsync(1000);
        expect(settled).toBe(false);
        expect(mockGenerate).not.toHaveBeenCalled();

        mockCache.delete('subject-images:in-flight:s-there');
        await jest.advanceTimersByTimeAsync(1000);
        expect(await forced).toBe('generated');
    });
});

describe('reportLookupFailure', () => {
    it('alerts once per window from memory when no marker can be held', async () => {
        mockCacheDown = true;
        await reportLookupFailure('s1', new Error('PermanentRedirect'));
        await reportLookupFailure('s2', new Error('PermanentRedirect'));
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
    });

    it('alerts once per window and logs the rest', async () => {
        await reportLookupFailure('s1', new Error('PermanentRedirect'));
        await reportLookupFailure('s2', new Error('PermanentRedirect'));
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledWith(expect.objectContaining({ context: { subjectId: 's1' } }));
        expect(console.error).toHaveBeenCalledTimes(2);
        expect(mockCache.get('subject-images:lookup-alerted')?.ttl).toBe(600);
    });
});

describe('generateImagesForMeeting', () => {
    it('runs every subject of the meeting and swallows failures', async () => {
        mockGetSubjectIdsForMeeting.mockResolvedValue(['a', 'b', 'c', 'd']);
        mockGetSubjectPromptInput.mockImplementation(async (id: string) =>
            id === 'c' ? null : { name: id, description: 'd', ...athens });

        await expect(generateImagesForMeeting('city', 'meeting')).resolves.toBeUndefined();

        expect(mockGetSubjectIdsForMeeting).toHaveBeenCalledWith('city', 'meeting');
        expect(mockStore.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b', 'd']);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a Gemini key', async () => {
        mockEnv.GEMINI_API_KEY = undefined;
        await generateImagesForMeeting('city', 'meeting');
        expect(mockGetSubjectIdsForMeeting).not.toHaveBeenCalled();
    });

    it('resolves and alerts when the subject lookup fails', async () => {
        mockGetSubjectIdsForMeeting.mockRejectedValue(new Error('db down'));

        await expect(generateImagesForMeeting('city', 'meeting')).resolves.toBeUndefined();

        expect(mockGenerate).not.toHaveBeenCalled();
        expect(mockSendErrorAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
            source: 'subject-images',
            error: 'db down',
            context: { cityId: 'city', councilMeetingId: 'meeting' },
        }));
    });
});
