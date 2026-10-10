const mockFindMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        role: { findMany: (...a: unknown[]) => mockFindMany(...a), update: jest.fn() },
        $transaction: (...a: unknown[]) => mockTransaction(...a),
    },
}));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn().mockResolvedValue(undefined) }));

import { updateElectedOrder } from '@/lib/db/roles';
import { BadRequestError } from '@/lib/api/errors';

beforeEach(() => jest.clearAllMocks());

describe('updateElectedOrder', () => {
    it('refuses a role of another body with a BadRequestError and writes nothing', async () => {
        mockFindMany.mockResolvedValue([{ id: 'r1', administrativeBodyId: 'other-body', person: { cityId: 'athens' } }]);

        const write = updateElectedOrder('athens', 'b1', [{ roleId: 'r1', electedOrder: 1 }]);

        await expect(write).rejects.toBeInstanceOf(BadRequestError);
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('refuses a role of a person of another city with a BadRequestError', async () => {
        mockFindMany.mockResolvedValue([{ id: 'r1', administrativeBodyId: 'b1', person: { cityId: 'argos' } }]);

        await expect(updateElectedOrder('athens', 'b1', [{ roleId: 'r1', electedOrder: 1 }])).rejects.toBeInstanceOf(BadRequestError);
        expect(mockTransaction).not.toHaveBeenCalled();
    });
});
