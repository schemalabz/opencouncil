/** @jest-environment node */

const mockEnv: { GEMINI_API_KEY?: string; DO_SPACES_BUCKET: string; SUBJECT_IMAGES_PREFIX: string; CDN_URL: string } = {
    GEMINI_API_KEY: 'gemini-key',
    DO_SPACES_BUCKET: 'bucket',
    SUBJECT_IMAGES_PREFIX: 'subject-images/8bit',
    CDN_URL: 'https://cdn.example/',
};
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

jest.mock('@/lib/s3', () => ({ s3Client: { send: jest.fn() } }));

const mockSendErrorAdminAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/discord', () => ({
    sendErrorAdminAlert: (...args: unknown[]) => mockSendErrorAdminAlert(...args),
}));

const mockGetSubjectPromptInput = jest.fn();
const mockGetSubjectIdsForMeeting = jest.fn();
jest.mock('@/lib/db/subject', () => ({
    getSubjectPromptInput: (...args: unknown[]) => mockGetSubjectPromptInput(...args),
    getSubjectIdsForMeeting: (...args: unknown[]) => mockGetSubjectIdsForMeeting(...args),
}));

const mockResolve = jest.fn();
const mockStore = jest.fn().mockResolvedValue(undefined);
const mockGenerate = jest.fn();
const mockToWebp = jest.fn(async (b: Buffer) => b);
jest.mock('@opencouncil/subject-images', () => ({
    buildPrompt: ({ title, description }: { title: string; description: string }) => `${title}|${description}`,
    generate: (...args: unknown[]) => mockGenerate(...args),
    resolve: (...args: unknown[]) => mockResolve(...args),
    store: (...args: unknown[]) => mockStore(...args),
    toWebp: (b: Buffer) => mockToWebp(b),
}));

import {
    generateImageForSubject,
    generateImagesForMeeting,
    isSubjectImageGenerationEnabled,
    resolveSubjectImage,
    storeSubjectImage,
} from '../subjectImages';

const image = Buffer.from('webp');

beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.GEMINI_API_KEY = 'gemini-key';
    mockResolve.mockResolvedValue(null);
    mockGenerate.mockResolvedValue(image);
    mockGetSubjectPromptInput.mockResolvedValue({ name: 'Title', description: 'Desc' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('resolveSubjectImage', () => {
    it('passes the bucket, the folder and the CDN origin without its trailing slash', async () => {
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

describe('generateImageForSubject', () => {
    it('is disabled without a Gemini key', async () => {
        mockEnv.GEMINI_API_KEY = undefined;
        expect(isSubjectImageGenerationEnabled()).toBe(false);
        expect(await generateImageForSubject('s1')).toBe('disabled');
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('generates from the subject title and description, then stores', async () => {
        expect(await generateImageForSubject('s1')).toBe('generated');
        expect(mockGenerate).toHaveBeenCalledWith('Title|Desc', { apiKey: 'gemini-key' });
        expect(mockStore).toHaveBeenCalledWith('s1', image, expect.objectContaining({ bucket: 'bucket' }));
    });

    it('strips markdown and reference links before prompting', async () => {
        mockGetSubjectPromptInput.mockResolvedValue({
            name: '**Βλάβη**',
            description: 'Εισήγηση [επί αποτελέσματος](REF:UTTERANCE:abc123) διαγωνισμού.',
        });
        await generateImageForSubject('s1');
        expect(mockGenerate).toHaveBeenCalledWith('Βλάβη|Εισήγηση επί αποτελέσματος διαγωνισμού.', { apiKey: 'gemini-key' });
    });

    it('skips a subject that already has an image', async () => {
        mockResolve.mockResolvedValue({ url: 'https://cdn.example/x.webp' });
        expect(await generateImageForSubject('s1')).toBe('exists');
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('replaces an existing image when forced', async () => {
        mockResolve.mockResolvedValue({ url: 'https://cdn.example/x.webp' });
        expect(await generateImageForSubject('s1', { force: true })).toBe('generated');
        expect(mockResolve).not.toHaveBeenCalled();
        expect(mockStore).toHaveBeenCalled();
    });

    it('alerts, rethrows, and holds off a retry after a failure', async () => {
        mockGenerate.mockRejectedValueOnce(new Error('quota'));
        await expect(generateImageForSubject('s-fail')).rejects.toThrow('quota');
        expect(mockSendErrorAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
            source: 'subject-images',
            error: 'quota',
            context: { subjectId: 's-fail' },
        }));

        expect(await generateImageForSubject('s-fail')).toBe('recent-failure');
        expect(mockGenerate).toHaveBeenCalledTimes(1);

        expect(await generateImageForSubject('s-fail', { force: true })).toBe('generated');
    });

    it('reports a subject already being generated', async () => {
        let finish: (value: Buffer) => void = () => {};
        mockGenerate.mockReturnValueOnce(new Promise<Buffer>((resolve) => { finish = resolve; }));

        const first = generateImageForSubject('s-slow');
        await Promise.resolve();
        await Promise.resolve();
        expect(await generateImageForSubject('s-slow')).toBe('in-flight');

        finish(image);
        expect(await first).toBe('generated');
    });
});

describe('generateImagesForMeeting', () => {
    it('runs every subject of the meeting and swallows failures', async () => {
        mockGetSubjectIdsForMeeting.mockResolvedValue(['a', 'b', 'c', 'd']);
        mockGetSubjectPromptInput.mockImplementation(async (id: string) =>
            id === 'c' ? null : { name: id, description: 'd' });

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
