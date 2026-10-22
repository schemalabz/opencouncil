/** @jest-environment node */
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        user: {
            findFirst: (...a: unknown[]) => mockFindFirst(...a),
            create: (...a: unknown[]) => mockCreate(...a),
        },
    },
}));

import { createMachineAccount, getMachineAccount } from '../machineAccounts';

const MACHINE = { id: 'bot-1', name: 'Paola', email: 'paola@machines.opencouncil.invalid', isSuperAdmin: true, isMachine: true };

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCreate.mockResolvedValue(MACHINE);
});

describe('createMachineAccount', () => {
    it('creates the account from the label, with every consent off and no sign-in', async () => {
        await createMachineAccount({ isMachine: true, label: '  Athens bot ', isSuperAdmin: false, administers: [{ cityId: 'athens' }] });

        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                email: 'athens-bot@machines.opencouncil.invalid',
                name: 'Athens bot',
                isMachine: true,
                isSuperAdmin: false,
                onboarded: true,
                allowProductUpdates: false,
                allowPetitionUpdates: false,
                allowFeedbackCalls: false,
                notifyByPhone: false,
                administers: { create: [{ cityId: 'athens' }] },
            }),
        }));
    });

    it('refuses a label with no Latin letter or digit', async () => {
        await expect(createMachineAccount({ isMachine: true, label: 'Παόλα', isSuperAdmin: true })).rejects.toThrow('Latin letter');
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('reports a taken label as a conflict, from the unique address', async () => {
        mockCreate.mockRejectedValueOnce({ code: 'P2002' });
        await expect(createMachineAccount({ isMachine: true, label: 'Paola', isSuperAdmin: true })).rejects.toThrow('already exists');
    });
});

describe('getMachineAccount', () => {
    it('resolves a machine account by id, and nothing else', async () => {
        mockFindFirst.mockResolvedValue(MACHINE);
        expect(await getMachineAccount('bot-1')).toEqual(MACHINE);
        expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bot-1', isMachine: true } }));

        mockFindFirst.mockResolvedValue(null);
        await expect(getMachineAccount('user-1')).rejects.toThrow('Machine account not found');
    });
});
