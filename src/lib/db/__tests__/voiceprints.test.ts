/** @jest-environment node */
// The admin's Delete Voiceprint button: authorize on the person's city, then remove the row and its clip.
const mockFindUnique = jest.fn();
const mockDeleteMany = jest.fn();
const mockDeleteFile = jest.fn();
const mockAuthorize = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        voicePrint: {
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
        },
    },
}));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: (...args: unknown[]) => mockAuthorize(...args) }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/env.mjs', () => ({ env: { DO_SPACES_BUCKET: 'townhalls-gr', CDN_URL: 'https://data.opencouncil.gr', DEPLOYMENT_ENV: 'production' } }));
jest.mock('@/lib/s3', () => ({
    deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
    listObjectKeys: jest.fn(),
    isStorageConfigured: () => true,
}));
jest.mock('@/lib/discord-core', () => ({ sendErrorAdminAlert: jest.fn() }));

import { deleteVoicePrint } from '../voiceprints';

const clip = 'https://opencouncil-previews.fra1.digitaloceanspaces.com/voiceprints/chania/p1/a_v1.mp3';

beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue({ id: 'v1', sourceAudioUrl: clip, person: { cityId: 'chania' } });
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockDeleteFile.mockResolvedValue(undefined);
    mockAuthorize.mockResolvedValue(true);
});

describe('deleteVoicePrint', () => {
    it('removes this voiceprint and its clip from the bucket the URL names', async () => {
        await deleteVoicePrint('v1');
        expect(mockAuthorize).toHaveBeenCalledWith({ cityId: 'chania' });
        expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 'v1' } });
        expect(mockDeleteFile).toHaveBeenCalledWith('opencouncil-previews', 'voiceprints/chania/p1/a_v1.mp3');
    });

    it('removes nothing for a caller not authorized on the city', async () => {
        mockAuthorize.mockRejectedValue(new Error('Forbidden'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(deleteVoicePrint('v1')).rejects.toThrow();
        expect(mockDeleteMany).not.toHaveBeenCalled();
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });
});
