/** @jest-environment node */
const mockFindMany = jest.fn();
const mockDelete = jest.fn();
const mockDeleteFile = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { voicePrint: { findMany: (...args: unknown[]) => mockFindMany(...args), delete: (...args: unknown[]) => mockDelete(...args) } },
}));
jest.mock('@/env.mjs', () => ({ env: { DO_SPACES_BUCKET: 'townhalls-gr', CDN_URL: 'https://data.opencouncil.gr' } }));
jest.mock('@/lib/s3', () => ({ deleteFile: (...args: unknown[]) => mockDeleteFile(...args) }));

import { deleteClip, deleteVoicePrints, deleteVoicePrintsWithoutConsent } from '../voiceprintsDelete';

const row = (id: string, url: string) => ({ id, personId: 'p1', sourceAudioUrl: url, person: { name: 'A', cityId: 'chania' } });
const taskServerClip = 'https://opencouncil-previews.fra1.digitaloceanspaces.com/voiceprints/chania/p1/a_v1.mp3';

beforeEach(() => {
    for (const m of [mockFindMany, mockDelete, mockDeleteFile]) m.mockReset();
    mockDelete.mockResolvedValue({});
    mockDeleteFile.mockResolvedValue(undefined);
});

describe('deleteVoicePrints', () => {
    it('deletes each row, then its clip from the bucket the URL names', async () => {
        mockFindMany.mockResolvedValue([row('v1', taskServerClip)]);

        const result = await deleteVoicePrints({ personId: 'p1' });

        expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'v1' } });
        expect(mockDeleteFile).toHaveBeenCalledWith('opencouncil-previews', 'voiceprints/chania/p1/a_v1.mp3');
        expect(result).toEqual({ voicePrints: [row('v1', taskServerClip)], clipFailures: [] });
    });

    it('in a dry run lists the rows and touches nothing', async () => {
        mockFindMany.mockResolvedValue([row('v1', taskServerClip)]);

        const result = await deleteVoicePrints({ personId: 'p1' }, { dryRun: true });

        expect(result.voicePrints).toHaveLength(1);
        expect(mockDelete).not.toHaveBeenCalled();
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('keeps going when a clip cannot be removed, and reports it; the row is gone', async () => {
        mockFindMany.mockResolvedValue([row('v1', taskServerClip), row('v2', 'https://data.opencouncil.gr/voiceprints/b.mp3')]);
        mockDeleteFile.mockRejectedValueOnce(new Error('AccessDenied'));

        const result = await deleteVoicePrints({ personId: 'p1' });

        expect(mockDelete).toHaveBeenCalledTimes(2);
        expect(mockDeleteFile).toHaveBeenCalledTimes(2);
        expect(result.clipFailures).toEqual([{ voicePrintId: 'v1', sourceAudioUrl: taskServerClip, error: 'AccessDenied' }]);
    });

    it('leaves a clip alone that is not a Spaces object', async () => {
        mockFindMany.mockResolvedValue([row('v1', 'https://example.com/seed/clip.mp3')]);

        const result = await deleteVoicePrints({ personId: 'p1' });

        expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'v1' } });
        expect(mockDeleteFile).not.toHaveBeenCalled();
        expect(result.clipFailures).toEqual([]);
    });
});

describe('deleteVoicePrintsWithoutConsent', () => {
    it('selects the voiceprints of people with no open period, for one person or one city', async () => {
        mockFindMany.mockResolvedValue([]);
        const noConsent = { person: { voicePrintConsents: { none: { withdrawnAt: null } } } };

        await deleteVoicePrintsWithoutConsent({ personId: 'p1' });
        expect(mockFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { ...noConsent, personId: 'p1' } }));

        await deleteVoicePrintsWithoutConsent({ cityId: 'chania' });
        expect(mockFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { person: { ...noConsent.person, cityId: 'chania' } } }));

        await deleteVoicePrintsWithoutConsent();
        expect(mockFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: noConsent }));
    });
});

describe('deleteClip', () => {
    it('removes the object the URL names', async () => {
        await deleteClip('https://data.opencouncil.gr/voiceprints/chania/p1/a.mp3');
        expect(mockDeleteFile).toHaveBeenCalledWith('townhalls-gr', 'voiceprints/chania/p1/a.mp3');
    });
});
