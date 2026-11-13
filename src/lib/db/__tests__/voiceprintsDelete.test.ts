/** @jest-environment node */
const order: string[] = [];
const consented = new Set<string>();
const mockVoicePrintFindMany = jest.fn();
const mockVoicePrintFindUnique = jest.fn();
const existingPeople = new Set<string>();
const mockPersonFindMany = jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.filter((id) => existingPeople.has(id)).map((id) => ({ id })));
const mockVoicePrintDeleteMany = jest.fn(async (...args: unknown[]) => { order.push('rows'); void args; return { count: 1 }; });
// Applies the `where` it is given, so a wrong consent filter shows.
const mockConsentFindMany = jest.fn(async ({ where }: { where: { personId: { in: string[] }; withdrawnAt: null } }) =>
    where.personId.in.filter((id) => consented.has(id)).map((personId) => ({ personId })));
const mockDeleteFile = jest.fn(async (bucket: string, key: string) => { order.push(`clip ${bucket}/${key}`); });
const mockListObjectKeys = jest.fn();
const mockIsStorageConfigured = jest.fn(() => true);
const mockSendErrorAdminAlert = jest.fn();
const mockEnv = { DO_SPACES_BUCKET: 'townhalls-gr', CDN_URL: 'https://data.opencouncil.gr', DEPLOYMENT_ENV: 'production' };

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        voicePrint: {
            findMany: (...args: unknown[]) => mockVoicePrintFindMany(...args),
            findUnique: (...args: unknown[]) => mockVoicePrintFindUnique(...args),
            deleteMany: (...args: unknown[]) => mockVoicePrintDeleteMany(...args),
        },
        person: { findMany: (args: { where: { id: { in: string[] } } }) => mockPersonFindMany(args) },
        voicePrintConsent: { findMany: (args: { where: { personId: { in: string[] }; withdrawnAt: null } }) => mockConsentFindMany(args) },
    },
}));
jest.mock('@/env.mjs', () => ({ get env() { return mockEnv; } }));
jest.mock('@/lib/s3', () => ({
    deleteFile: (bucket: string, key: string) => mockDeleteFile(bucket, key),
    listObjectKeys: (...args: unknown[]) => mockListObjectKeys(...args),
    isStorageConfigured: () => mockIsStorageConfigured(),
}));
jest.mock('@/lib/discord-core', () => ({ sendErrorAdminAlert: (...args: unknown[]) => mockSendErrorAdminAlert(...args) }));

import { voicePrintsWithoutConsentWhere } from '../voicePrintConsentRule';
import {
    deleteVoiceDataWithoutConsent, deleteVoicePrintById, isClipKeyPart, planVoiceDataDeletion, runVoiceDataDeletion,
    type VoiceDataPlan,
} from '../voiceprintsDelete';

const cdnClip = 'https://data.opencouncil.gr/voiceprints/chania/p1/b_v1.mp3';
const previewClip = 'https://opencouncil-previews.fra1.digitaloceanspaces.com/voiceprints/chania/p1/a_v1.mp3';
const row = (id: string) => ({ id, sourceAudioUrl: cdnClip, person: { name: 'A', cityId: 'chania' } });
const clip = (key: string, bucket = 'townhalls-gr') => ({ bucket, key });
const plan = (overrides: Partial<VoiceDataPlan> = {}): VoiceDataPlan => ({ voicePrints: [row('v1')], clips: [], listed: true, listFailures: [], ...overrides });

/** The rows query first, then the bucket-URL query. */
const rowsAndUrls = (rows: unknown[], urls: string[] = []) => mockVoicePrintFindMany
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce(urls.map((sourceAudioUrl) => ({ sourceAudioUrl })));

beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
    consented.clear();
    existingPeople.clear();
    mockEnv.DEPLOYMENT_ENV = 'production';
    mockIsStorageConfigured.mockReturnValue(true);
    mockListObjectKeys.mockResolvedValue([]);
    // A reset, not a clear: a value queued with mockResolvedValueOnce and not read must not leak into the next test.
    mockVoicePrintFindMany.mockReset().mockResolvedValue([]);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('isClipKeyPart', () => {
    it('takes a city id or a person id, and refuses what is not one part of a key', () => {
        for (const part of ['chania', 'vari-voula-vouliagmeni', 'cmr24ihjg08ft12olzehpmx39']) expect(isClipKeyPart(part)).toBe(true);
        for (const part of ['', 'a/b', '..', 'a b']) expect(isClipKeyPart(part)).toBe(false);
    });
});

describe('planVoiceDataDeletion', () => {
    it("for a person, takes their rows without consent and their clips in every city's folder, in each bucket that a row names", async () => {
        rowsAndUrls([row('v1')], [cdnClip, previewClip]);
        mockListObjectKeys.mockImplementation(async (bucket: string) => bucket === 'townhalls-gr'
            ? ['voiceprints/chania/p1/b_v1.mp3', 'voiceprints/athens/p1/orphan_v1.mp3', 'voiceprints/chania/p10/c_v1.mp3']
            : ['voiceprints/chania/p1/a_v1.mp3']);

        const found = await planVoiceDataDeletion({ personId: 'p1' });

        expect(mockVoicePrintFindMany.mock.calls[0][0].where).toEqual({ AND: [voicePrintsWithoutConsentWhere, { personId: 'p1' }] });
        expect(mockListObjectKeys.mock.calls).toEqual([['townhalls-gr', 'voiceprints/'], ['opencouncil-previews', 'voiceprints/']]);
        expect(found).toEqual({
            voicePrints: [row('v1')],
            clips: [
                clip('voiceprints/chania/p1/b_v1.mp3'),
                clip('voiceprints/athens/p1/orphan_v1.mp3'),
                clip('voiceprints/chania/p1/a_v1.mp3', 'opencouncil-previews'),
            ],
            listed: true,
            listFailures: [],
        });
    });

    it('keeps the clips of people with a consent in force, and takes those of people without one or who no longer exist', async () => {
        consented.add('kept');
        mockListObjectKeys.mockResolvedValue([
            'voiceprints/chania/kept/a_v1.mp3', 'voiceprints/chania/gone/b_v1.mp3', 'voiceprints/stray.mp3', 'voiceprints/chania/marker/',
        ]);

        const found = await planVoiceDataDeletion();

        expect(found.clips).toEqual([clip('voiceprints/chania/gone/b_v1.mp3')]);
        expect(mockConsentFindMany.mock.calls[0][0].where).toEqual({ personId: { in: ['kept', 'gone'] }, withdrawnAt: null });
    });

    it("for a city, takes the rows of the city's people, the clips in its folder, and the clips of people who no longer exist", async () => {
        existingPeople.add('other');
        mockListObjectKeys.mockResolvedValue([
            'voiceprints/chania/other/a_v1.mp3', 'voiceprints/athens/gone/b_v1.mp3', 'voiceprints/athens/other/c_v1.mp3',
        ]);

        const found = await planVoiceDataDeletion({ cityId: 'chania' });

        expect(mockVoicePrintFindMany.mock.calls[0][0].where).toEqual({ AND: [voicePrintsWithoutConsentWhere, { person: { cityId: 'chania' } }] });
        expect(mockListObjectKeys).toHaveBeenCalledWith('townhalls-gr', 'voiceprints/');
        expect(found.clips).toEqual([clip('voiceprints/chania/other/a_v1.mp3'), clip('voiceprints/athens/gone/b_v1.mp3')]);
    });

    it('reports a bucket that cannot be listed and goes on with the others', async () => {
        rowsAndUrls([], [previewClip]);
        mockListObjectKeys.mockImplementation(async (bucket: string) => {
            if (bucket === 'townhalls-gr') throw new Error('AccessDenied');
            return ['voiceprints/chania/gone/d_v1.mp3'];
        });
        const found = await planVoiceDataDeletion();
        expect(found.listFailures).toEqual([{ item: 'townhalls-gr/voiceprints/', error: 'AccessDenied' }]);
        expect(found.clips).toEqual([clip('voiceprints/chania/gone/d_v1.mp3', 'opencouncil-previews')]);
    });

    it('takes the rows without storage keys, and says that the clips were not listed', async () => {
        mockIsStorageConfigured.mockReturnValue(false);
        rowsAndUrls([row('v1')]);
        const found = await planVoiceDataDeletion();
        expect(found).toEqual({ voicePrints: [row('v1')], clips: [], listed: false, listFailures: [] });
        expect(mockListObjectKeys).not.toHaveBeenCalled();
    });

    it('takes no clip for an id that no clip key can hold, and still takes its rows', async () => {
        mockListObjectKeys.mockResolvedValue(['voiceprints/chania/p1/b_v1.mp3']);
        for (const personId of ['', 'a/b']) {
            mockVoicePrintFindMany.mockResolvedValueOnce([row('v1')]).mockResolvedValueOnce([]);
            const found = await planVoiceDataDeletion({ personId });
            expect(found).toEqual({ voicePrints: [row('v1')], clips: [], listed: true, listFailures: [] });
        }
        expect(mockVoicePrintFindMany.mock.calls[0][0].where).toEqual({ AND: [voicePrintsWithoutConsentWhere, { personId: '' }] });
    });

    it('plans the rows only with listClips false', async () => {
        rowsAndUrls([row('v1')]);
        expect(await planVoiceDataDeletion({ personId: 'p1' }, { listClips: false })).toEqual({ voicePrints: [row('v1')], clips: [], listed: false, listFailures: [] });
        expect(mockListObjectKeys).not.toHaveBeenCalled();
    });
});

describe('runVoiceDataDeletion', () => {
    it('deletes the rows that still lack a consent first, then the clips', async () => {
        await expect(runVoiceDataDeletion(plan({ clips: [clip('voiceprints/chania/p1/b_v1.mp3')] }))).resolves.toEqual([]);
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledWith({ where: { AND: [{ id: { in: ['v1'] } }, voicePrintsWithoutConsentWhere] } });
        expect(order).toEqual(['rows', 'clip townhalls-gr/voiceprints/chania/p1/b_v1.mp3']);
    });

    it('keeps the clips of a person who consented since the plan', async () => {
        consented.add('p1');
        await runVoiceDataDeletion(plan({ clips: [clip('voiceprints/chania/p1/b_v1.mp3'), clip('voiceprints/chania/p2/c_v1.mp3')] }));
        expect(mockDeleteFile.mock.calls).toEqual([['townhalls-gr', 'voiceprints/chania/p2/c_v1.mp3']]);
    });

    it('deletes the rows but no clip outside production, where the bucket and the ids can be production ones', async () => {
        for (const environment of ['staging', 'preview', 'development']) {
            mockEnv.DEPLOYMENT_ENV = environment;
            await runVoiceDataDeletion(plan({ clips: [clip('voiceprints/chania/p1/b_v1.mp3')] }));
        }
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledTimes(3);
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('throws when the rows cannot be deleted, and keeps every clip', async () => {
        mockVoicePrintDeleteMany.mockRejectedValueOnce(new Error('connection lost'));
        await expect(runVoiceDataDeletion(plan({ clips: [clip('voiceprints/chania/p1/b_v1.mp3')] }))).rejects.toThrow('connection lost');
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('returns each clip that cannot be deleted, and goes on with the others', async () => {
        mockDeleteFile.mockRejectedValueOnce(new Error('Timeout'));
        const failures = await runVoiceDataDeletion(plan({ clips: [clip('voiceprints/chania/p1/a.mp3'), clip('voiceprints/chania/p1/b.mp3')] }));
        expect(failures).toEqual([{ item: 'townhalls-gr/voiceprints/chania/p1/a.mp3', error: 'Timeout' }]);
        expect(mockDeleteFile).toHaveBeenCalledTimes(2);
    });
});

describe('deleteVoiceDataWithoutConsent', () => {
    it("deletes the person's rows and every clip in their folders", async () => {
        rowsAndUrls([row('v1')]);
        mockListObjectKeys.mockResolvedValue(['voiceprints/chania/p1/b_v1.mp3', 'voiceprints/athens/p1/orphan_v1.mp3']);

        await expect(deleteVoiceDataWithoutConsent({ personId: 'p1' }, 'test')).resolves.toEqual([]);

        expect(order).toEqual(['rows', 'clip townhalls-gr/voiceprints/chania/p1/b_v1.mp3', 'clip townhalls-gr/voiceprints/athens/p1/orphan_v1.mp3']);
        expect(mockSendErrorAdminAlert).not.toHaveBeenCalled();
    });

    it('deletes nothing of a person whose consent is in force', async () => {
        consented.add('p1');
        mockListObjectKeys.mockResolvedValue(['voiceprints/chania/p1/b_v1.mp3']);
        await deleteVoiceDataWithoutConsent({ personId: 'p1' }, 'test');
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('reports a listing failure, and still deletes the rows', async () => {
        rowsAndUrls([row('v1')]);
        mockListObjectKeys.mockRejectedValue(new Error('AccessDenied'));
        await expect(deleteVoiceDataWithoutConsent({ personId: 'p1' }, 'test')).resolves.toEqual([{ item: 'townhalls-gr/voiceprints/', error: 'AccessDenied' }]);
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledTimes(1);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
    });

    it('outside production, deletes the rows and lists no bucket, so it raises no alert for clips it would keep', async () => {
        mockEnv.DEPLOYMENT_ENV = 'preview';
        rowsAndUrls([row('v1')]);
        mockListObjectKeys.mockRejectedValue(new Error('AccessDenied'));
        await expect(deleteVoiceDataWithoutConsent({ personId: 'p1' }, 'test')).resolves.toEqual([]);
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledTimes(1);
        expect(mockListObjectKeys).not.toHaveBeenCalled();
        expect(mockSendErrorAdminAlert).not.toHaveBeenCalled();
    });

    it('deletes nothing for a scope without an id, which would mean every person', async () => {
        const scopes = [{ personId: undefined }, { cityId: undefined }] as unknown as { personId: string }[];
        for (const scope of scopes) {
            await expect(deleteVoiceDataWithoutConsent(scope, 'test')).resolves.toEqual([{ item: 'voice data (test)', error: 'No person or city id' }]);
        }
        expect(mockVoicePrintFindMany).not.toHaveBeenCalled();
        expect(mockVoicePrintDeleteMany).not.toHaveBeenCalled();
    });

    it('reports, and does not throw, a failure of the database', async () => {
        mockVoicePrintFindMany.mockRejectedValueOnce(new Error('connection lost'));
        await expect(deleteVoiceDataWithoutConsent({ cityId: 'chania' }, 'test')).resolves.toEqual([{ item: 'voice data (test)', error: 'connection lost' }]);
        expect(mockSendErrorAdminAlert).toHaveBeenCalledTimes(1);
    });
});

describe('deleteVoicePrintById', () => {
    it('deletes one row, then the clip that it names', async () => {
        mockVoicePrintFindUnique.mockResolvedValue({ sourceAudioUrl: cdnClip });
        await deleteVoicePrintById('v1');
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledWith({ where: { id: 'v1' } });
        expect(order).toEqual(['rows', 'clip townhalls-gr/voiceprints/chania/p1/b_v1.mp3']);
    });

    it('deletes the row but not the clip outside production, and touches nothing outside the clip folder', async () => {
        mockVoicePrintFindUnique.mockResolvedValue({ sourceAudioUrl: cdnClip });
        mockEnv.DEPLOYMENT_ENV = 'preview';
        await deleteVoicePrintById('v1');
        mockEnv.DEPLOYMENT_ENV = 'production';
        mockVoicePrintFindUnique.mockResolvedValue({ sourceAudioUrl: 'https://data.opencouncil.gr/uploads/agenda.pdf' });
        await deleteVoicePrintById('v2');
        expect(mockVoicePrintDeleteMany).toHaveBeenCalledTimes(2);
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('throws when the row cannot be deleted, so the admin sees that the voiceprint is still there', async () => {
        mockVoicePrintFindUnique.mockResolvedValue({ sourceAudioUrl: cdnClip });
        mockVoicePrintDeleteMany.mockRejectedValueOnce(new Error('connection lost'));
        await expect(deleteVoicePrintById('v1')).rejects.toThrow('connection lost');
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });
});
