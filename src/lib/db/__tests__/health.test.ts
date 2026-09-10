/** @jest-environment node */
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { $queryRaw: jest.fn() },
}));

import prisma from '@/lib/db/prisma';
import { getDatabaseState } from '../health';

const mockQueryRaw = prisma.$queryRaw as unknown as jest.Mock;

describe('getDatabaseState', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('reports the newest applied migration', async () => {
        mockQueryRaw.mockResolvedValue([{ migration_name: '20260906120000_replace_party_rank_with_elected_order' }]);

        await expect(getDatabaseState()).resolves.toEqual({
            database: 'ok',
            migration: '20260906120000_replace_party_rank_with_elected_order',
        });
    });

    it('reports ok with a null migration on an empty table', async () => {
        mockQueryRaw.mockResolvedValue([]);

        await expect(getDatabaseState()).resolves.toEqual({ database: 'ok', migration: null });
    });

    // The release poller cannot tell a thrown route from an old build, so a
    // database failure must never propagate out of this function.
    it('reports unreachable instead of throwing when the query fails', async () => {
        mockQueryRaw.mockRejectedValue(new Error('connection refused'));

        await expect(getDatabaseState()).resolves.toEqual({ database: 'unreachable', migration: null });
    });
});
