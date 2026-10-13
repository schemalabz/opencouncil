/** @jest-environment node */
const order: string[] = [];
const mockVoicePrintFindMany = jest.fn();
const mockVoicePrintFindUnique = jest.fn();
const mockVoicePrintDeleteMany = jest.fn(async (...args: unknown[]) => { order.push('rows'); void args; return { count: 1 }; });
const mockPersonFindUnique = jest.fn();
const mockPersonFindMany = jest.fn();
const mockPersonCount = jest.fn();
const mockDeleteFile = jest.fn(async (bucket: string, key: string) => { order.push(`clip ${bucket}/${key}`); });
const mockListObjectKeys = jest.fn();
const mockIsStorageConfigured = jest.fn(() => true);
const mockFindVoiceprintTasks = jest.fn();
const mockSendErrorAdminAlert = jest.fn();
const mockEnv = { DO_SPACES_BUCKET: 'townhalls-gr', CDN_URL: 'https://data.opencouncil.gr' };

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        voicePrint: {
            findMany: (...args: unknown[]) => mockVoicePrintFindMany(...args),
            findUnique: (...args: unknown[]) => mockVoicePrintFindUnique(...args),
            deleteMany: (...args: unknown[]) => mockVoicePrintDeleteMany(...args),
        },
        person: {
            findUnique: (...args: unknown[]) => mockPersonFindUnique(...args),
            findMany: (...args: unknown[]) => mockPersonFindMany(...args),
            count: (...args: unknown[]) => mockPersonCount(...args),
        },
    },
}));
jest.mock('@/env.mjs', () => ({ get env() { return mockEnv; } }));
jest.mock('@/lib/s3', () => ({
    deleteFile: (bucket: string, key: string) => mockDeleteFile(bucket, key),
    listObjectKeys: (...args: unknown[]) => mockListObjectKeys(...args),
    isStorageConfigured: () => mockIsStorageConfigured(),
}));
jest.mock('@/lib/db/voiceprintTasks', () => ({ findVoiceprintTasks: (...args: unknown[]) => mockFindVoiceprintTasks(...args) }));
jest.mock('@/lib/discord-core', () => ({ sendErrorAdminAlert: (...args: unknown[]) => mockSendErrorAdminAlert(...args) }));

import { voicePrintConsentInForce, voicePrintsWithoutConsentWhere } from '../voicePrintConsentRule';
import {
    deleteClip, deleteVoiceData, deleteVoiceDataWithoutConsent, deleteVoicePrintById, findVoiceData,
    planVoiceDataSweep, runVoiceDataSweep, voiceprintClipFolder,
} from '../voiceprintsDelete';

const previewClip = 'https://opencouncil-previews.fra1.digitaloceanspaces.com/voiceprints/chania/p1/a_v1.mp3';
const cdnClip = 'https://data.opencouncil.gr/voiceprints/chania/p1/b_v1.mp3';

beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
    mockIsStorageConfigured.mockReturnValue(true);
    mockListObjectKeys.mockResolvedValue([]);
    mockFindVoiceprintTasks.mockResolvedValue([]);
    mockVoicePrintFindMany.mockResolvedValue([]);
    mockPersonFindUnique.mockResolvedValue({ cityId: 'chania' });
    mockPersonFindMany.mockResolvedValue([]);
    mockPersonCount.mockResolvedValue(0);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('voiceprintClipFolder', () => {
    it('names the folder of a city or of a person, with the trailing slash that keeps p1 from matching p10', () => {
        expect(voiceprintClipFolder('chania')).toBe('voiceprints/chania/');
        expect(voiceprintClipFolder('chania', 'p1')).toBe('voiceprints/chania/p1/');
    });

    it('refuses a part that would widen the folder', () => {
        for (const part of ['', 'a/b', '..', 'a b']) {
            expect(() => voiceprintClipFolder(part)).toThrow();
            expect(() => voiceprintClipFolder('chania', part)).toThrow();
        }
    });
});

describe('deleteClip', () => {
    it('removes the object the URL names, from the bucket the URL names', async () => {
        await expect(deleteClip(previewClip)).resolves.toBeNull();
        await deleteClip(cdnClip);
        expect(mockDeleteFile.mock.calls).toEqual([
            ['opencouncil-previews', 'voiceprints/chania/p1/a_v1.mp3'],
            ['townhalls-gr', 'voiceprints/chania/p1/b_v1.mp3'],
        ]);
    });

    it('leaves alone anything outside the clip folder', async () => {
        await deleteClip('https://data.opencouncil.gr/uploads/agenda.pdf');
        await deleteClip('https://example.com/voiceprints/a/b/c.mp3');
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('returns a failure instead of throwing', async () => {
        mockDeleteFile.mockRejectedValueOnce(new Error('AccessDenied'));
        await expect(deleteClip(cdnClip)).resolves.toEqual({ clip: 'townhalls-gr/voiceprints/chania/p1/b_v1.mp3', error: 'AccessDenied' });
    });
});

describe('findVoiceData', () => {
    it('collects the rows, the clips that rows and tasks name, and the person\'s folder in every bucket those clips are in', async () => {
        mockVoicePrintFindMany.mockResolvedValue([{ id: 'v1', sourceAudioUrl: cdnClip }]);
        mockFindVoiceprintTasks.mockResolvedValue([
            { request: { cityId: 'chania', personId: 'p1' }, result: { audioUrl: previewClip } },
            { request: { cityId: 'chania', personId: 'p1' }, result: { audioUrl: cdnClip } },
        ]);

        const data = await findVoiceData({ personId: 'p1' });

        expect(data.voicePrintIds).toEqual(['v1']);
        expect(data.clipUrls).toEqual([cdnClip, previewClip]);
        expect(data.folders).toEqual([
            { bucket: 'townhalls-gr', key: 'voiceprints/chania/p1/' },
            { bucket: 'opencouncil-previews', key: 'voiceprints/chania/p1/' },
        ]);
    });

    it('finds the folder of a person with no row and no task left', async () => {
        const data = await findVoiceData({ personId: 'p1' });
        expect(data.folders).toEqual([{ bucket: 'townhalls-gr', key: 'voiceprints/chania/p1/' }]);
    });

    it('takes the folder of the whole city for a city', async () => {
        const data = await findVoiceData({ cityId: 'chania' });
        expect(data.folders).toEqual([{ bucket: 'townhalls-gr', key: 'voiceprints/chania/' }]);
        expect(mockFindVoiceprintTasks).toHaveBeenCalledWith({ cityId: 'chania' });
    });
});

describe('deleteVoiceData', () => {
    const data = { voicePrintIds: ['v1'], clipUrls: [cdnClip], folders: [{ bucket: 'townhalls-gr', key: 'voiceprints/chania/p1/' }] };

    it('deletes the rows first, then what the folder holds, then a named clip that the folder did not hold, each once', async () => {
        mockListObjectKeys.mockResolvedValue(['voiceprints/chania/p1/b_v1.mp3', 'voiceprints/chania/p1/orphan_v1.mp3']);
        const outside = 'https://data.opencouncil.gr/voiceprints/athens/p1/c_v1.mp3';

        await expect(deleteVoiceData({ ...data, clipUrls: [cdnClip, outside] }, 'test')).resolves.toEqual([]);

        expect(mockVoicePrintDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['v1'] } } });
        expect(order).toEqual([
            'rows',
            'clip townhalls-gr/voiceprints/chania/p1/b_v1.mp3',
            'clip townhalls-gr/voiceprints/chania/p1/orphan_v1.mp3',
            'clip townhalls-gr/voiceprints/athens/p1/c_v1.mp3',
        ]);
        expect(mockSendErrorAdminAlert).not.toHaveBeenCalled();
    });

    it('keeps the clips when the rows cannot be deleted, so no stored row names a missing clip', async () => {
        mockVoicePrintDeleteMany.mockRejectedValueOnce(new Error('connection lost'));
        await expect(deleteVoiceData(data, 'test')).resolves.toEqual([{ clip: 'voiceprint rows', error: 'connection lost' }]);
        expect(mockListObjectKeys).not.toHaveBeenCalled();
        expect(mockDeleteFile).not.toHaveBeenCalled();
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
    });

    it('touches no bucket without storage keys', async () => {
        mockIsStorageConfigured.mockReturnValue(false);
        await deleteVoiceData(data, 'test');
        expect(mockDeleteFile).not.toHaveBeenCalled();
        expect(mockListObjectKeys).not.toHaveBeenCalled();
    });

    it('reports, and does not throw, when a listing or a clip fails', async () => {
        mockListObjectKeys.mockRejectedValue(new Error('AccessDenied'));
        mockDeleteFile.mockRejectedValueOnce(new Error('Timeout'));

        const failures = await deleteVoiceData(data, 'test');

        expect(failures).toEqual([
            { clip: 'townhalls-gr/voiceprints/chania/p1/', error: 'AccessDenied' },
            { clip: 'townhalls-gr/voiceprints/chania/p1/b_v1.mp3', error: 'Timeout' },
        ]);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
    });
});

describe('deleteVoiceDataWithoutConsent', () => {
    it('refuses an id that is no person id, before it reads or deletes anything, and reports it instead of throwing', async () => {
        for (const id of ['', 'a/b']) {
            await expect(deleteVoiceDataWithoutConsent(id)).resolves.toEqual([{ clip: `voice data of person ${id}`, error: `Not a person id: "${id}"` }]);
        }
        expect(mockPersonCount).not.toHaveBeenCalled();
        expect(mockVoicePrintDeleteMany).not.toHaveBeenCalled();
    });

    it('deletes nothing while a consent is in force', async () => {
        mockPersonCount.mockResolvedValue(1);
        await expect(deleteVoiceDataWithoutConsent('p1')).resolves.toEqual([]);
        expect(mockPersonCount).toHaveBeenCalledWith({ where: { id: 'p1', ...voicePrintConsentInForce } });
        expect(mockVoicePrintDeleteMany).not.toHaveBeenCalled();
    });

    it('deletes the person\'s voice data, folder included, when no consent is in force', async () => {
        mockVoicePrintFindMany.mockResolvedValue([{ id: 'v1', sourceAudioUrl: cdnClip }]);
        await deleteVoiceDataWithoutConsent('p1');
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['v1'] } } });
        expect(mockListObjectKeys).toHaveBeenCalledWith('townhalls-gr', 'voiceprints/chania/p1/');
    });

    it('reports, and does not throw, when reading the voice data fails', async () => {
        mockPersonCount.mockRejectedValue(new Error('connection lost'));
        await expect(deleteVoiceDataWithoutConsent('p1')).resolves.toHaveLength(1);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
    });
});

describe('deleteVoicePrintById', () => {
    it('deletes one row and its clip, and no folder', async () => {
        mockVoicePrintFindUnique.mockResolvedValue({ sourceAudioUrl: cdnClip });
        await deleteVoicePrintById('v1');
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledWith({ where: { id: 'v1' } });
        expect(mockDeleteFile).toHaveBeenCalledWith('townhalls-gr', 'voiceprints/chania/p1/b_v1.mp3');
        expect(mockListObjectKeys).not.toHaveBeenCalled();
    });

    it('throws when the row cannot be deleted, so the admin sees that the voiceprint is still there', async () => {
        mockVoicePrintFindUnique.mockResolvedValue({ sourceAudioUrl: cdnClip });
        mockVoicePrintDeleteMany.mockRejectedValueOnce(new Error('connection lost'));
        await expect(deleteVoicePrintById('v1')).rejects.toThrow('connection lost');
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });
});

describe('planVoiceDataSweep', () => {
    it('finds the clips of people without consent and of people who no longer exist, and keeps the clips of people with one', async () => {
        mockVoicePrintFindMany
            .mockResolvedValueOnce([{ id: 'v1', sourceAudioUrl: cdnClip, person: { name: 'A', cityId: 'chania' } }])
            .mockResolvedValueOnce([{ sourceAudioUrl: cdnClip }, { sourceAudioUrl: previewClip }]);
        mockListObjectKeys.mockImplementation(async (bucket: string) => bucket === 'townhalls-gr'
            ? ['voiceprints/chania/p1/b_v1.mp3', 'voiceprints/chania/kept/c_v1.mp3', 'voiceprints/chania/gone/d_v1.mp3', 'voiceprints/stray.mp3']
            : []);
        mockPersonFindMany.mockResolvedValue([{ id: 'kept' }]);

        const sweep = await planVoiceDataSweep();

        expect(mockVoicePrintFindMany.mock.calls[0][0].where).toEqual({ AND: [voicePrintsWithoutConsentWhere] });
        expect(mockListObjectKeys.mock.calls).toEqual([['townhalls-gr', 'voiceprints/'], ['opencouncil-previews', 'voiceprints/']]);
        expect(mockPersonFindMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'kept', 'gone'] }, ...voicePrintConsentInForce }, select: { id: true } });
        expect(sweep.clips).toEqual([
            { bucket: 'townhalls-gr', key: 'voiceprints/chania/p1/b_v1.mp3' },
            { bucket: 'townhalls-gr', key: 'voiceprints/chania/gone/d_v1.mp3' },
        ]);
        expect(sweep.listFailures).toEqual([]);
        expect(mockDeleteFile).not.toHaveBeenCalled();
        expect(mockVoicePrintDeleteMany).not.toHaveBeenCalled();
    });

    it('reports a bucket that cannot be listed and goes on with the others', async () => {
        mockVoicePrintFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ sourceAudioUrl: previewClip }]);
        mockListObjectKeys.mockImplementation(async (bucket: string) => {
            if (bucket === 'townhalls-gr') throw new Error('AccessDenied');
            return ['voiceprints/chania/gone/d_v1.mp3'];
        });
        const sweep = await planVoiceDataSweep();
        expect(sweep.listFailures).toEqual([{ clip: 'townhalls-gr/voiceprints/', error: 'AccessDenied' }]);
        expect(sweep.clips).toEqual([{ bucket: 'opencouncil-previews', key: 'voiceprints/chania/gone/d_v1.mp3' }]);
    });

    it('lists the rows without storage keys, and says that the clips were not listed', async () => {
        mockIsStorageConfigured.mockReturnValue(false);
        mockVoicePrintFindMany.mockResolvedValueOnce([{ id: 'v1', sourceAudioUrl: cdnClip, person: { name: 'A', cityId: 'chania' } }]);
        const sweep = await planVoiceDataSweep();
        expect(sweep.voicePrints).toHaveLength(1);
        expect(sweep.clips).toEqual([]);
        expect(sweep.listFailures).toHaveLength(1);
        expect(mockListObjectKeys).not.toHaveBeenCalled();
    });

    it('limits the rows and the listing to one city', async () => {
        await planVoiceDataSweep({ cityId: 'chania' });
        expect(mockVoicePrintFindMany.mock.calls[0][0].where).toEqual({ AND: [voicePrintsWithoutConsentWhere, { person: { cityId: 'chania' } }] });
        expect(mockListObjectKeys).toHaveBeenCalledWith('townhalls-gr', 'voiceprints/chania/');
    });
});

describe('runVoiceDataSweep', () => {
    it('deletes only the rows that still lack a consent, then the clips', async () => {
        const failures = await runVoiceDataSweep({
            voicePrints: [{ id: 'v1', sourceAudioUrl: cdnClip, person: { name: 'A', cityId: 'chania' } }],
            clips: [{ bucket: 'townhalls-gr', key: 'voiceprints/chania/p1/b_v1.mp3' }],
            listFailures: [],
        });
        expect(failures).toEqual([]);
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledWith({ where: { AND: [{ id: { in: ['v1'] } }, voicePrintsWithoutConsentWhere] } });
        expect(order).toEqual(['rows', 'clip townhalls-gr/voiceprints/chania/p1/b_v1.mp3']);
    });
});

describe('runVoiceDataSweep, a consent given since the plan', () => {
    it('keeps the clips of a person who consented between the plan and the run', async () => {
        mockPersonFindMany.mockResolvedValue([{ id: 'p1' }]);
        await runVoiceDataSweep({
            voicePrints: [],
            clips: [{ bucket: 'townhalls-gr', key: 'voiceprints/chania/p1/b_v1.mp3' }, { bucket: 'townhalls-gr', key: 'voiceprints/chania/p2/c_v1.mp3' }],
            listFailures: [],
        });
        expect(mockDeleteFile.mock.calls).toEqual([['townhalls-gr', 'voiceprints/chania/p2/c_v1.mp3']]);
    });
});
