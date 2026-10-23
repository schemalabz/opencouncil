/** @jest-environment node */
const mockWithUserAuthorizedToEdit = jest.fn();
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
}));
const mockGetMachineAccount = jest.fn();
jest.mock('@/lib/db/machineAccounts', () => ({
    getMachineAccount: (...args: unknown[]) => mockGetMachineAccount(...args),
}));
const mockCreate = jest.fn();
const mockList = jest.fn();
const mockRevoke = jest.fn();
jest.mock('@/lib/db/mcpTokens', () => ({
    createUserMcpToken: (...args: unknown[]) => mockCreate(...args),
    listUserMcpTokens: (...args: unknown[]) => mockList(...args),
    revokeUserMcpToken: (...args: unknown[]) => mockRevoke(...args),
}));

import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { listMachineTokens, mintMachineToken, revokeMachineToken } from '../machineAccounts';

const ACCOUNT = { id: 'bot-1', name: 'Paola', email: 'paola@machines.opencouncil.invalid' };

beforeEach(() => {
    for (const m of [mockWithUserAuthorizedToEdit, mockGetMachineAccount, mockCreate, mockList, mockRevoke]) m.mockReset();
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    mockGetMachineAccount.mockResolvedValue(ACCOUNT);
    mockList.mockResolvedValue([{ id: 't1' }]);
    mockCreate.mockResolvedValue({ id: 't1', rawToken: 'mcp_raw' });
});

describe('the superadmin gate', () => {
    it.each([
        ['nobody signed in', new UnauthorizedError()],
        ['a city admin', new ForbiddenError('Not authorized')],
    ])('refuses %s before any read or write', async (_who, error) => {
        mockWithUserAuthorizedToEdit.mockRejectedValue(error);

        await expect(listMachineTokens('bot-1')).rejects.toBe(error);
        await expect(mintMachineToken('bot-1')).rejects.toBe(error);
        await expect(revokeMachineToken('bot-1', 't1')).rejects.toBe(error);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({});
        for (const m of [mockGetMachineAccount, mockCreate, mockList, mockRevoke]) {
            expect(m).not.toHaveBeenCalled();
        }
    });
});

describe('the account filter', () => {
    it("refuses a person's account id before any token call", async () => {
        // getMachineAccount answers for machine accounts only, so a person's
        // tokens are out of reach of this surface.
        mockGetMachineAccount.mockRejectedValue(new NotFoundError('Machine account not found'));

        await expect(mintMachineToken('person-1')).rejects.toThrow(NotFoundError);
        await expect(revokeMachineToken('person-1', 't1')).rejects.toThrow(NotFoundError);
        for (const m of [mockCreate, mockList, mockRevoke]) expect(m).not.toHaveBeenCalled();
    });

    it('refuses an id that is not a non-empty string before any read', async () => {
        for (const id of [undefined, null, '', { contains: '' }, 42]) {
            await expect(mintMachineToken(id as unknown as string)).rejects.toThrow(BadRequestError);
            await expect(revokeMachineToken('bot-1', id as unknown as string)).rejects.toThrow(BadRequestError);
        }
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockRevoke).not.toHaveBeenCalled();
    });
});

describe('mintMachineToken', () => {
    it("mints an ordinary token for the account and returns the raw token with the list", async () => {
        expect(await mintMachineToken('bot-1')).toEqual({ id: 't1', rawToken: 'mcp_raw', tokens: [{ id: 't1' }] });
        // The id comes from the resolved account, never from the caller.
        expect(mockCreate).toHaveBeenCalledWith('bot-1');
        expect(mockList).toHaveBeenCalledWith('bot-1');
    });
});

describe('revokeMachineToken', () => {
    it("revokes within the account's own tokens and returns the fresh list", async () => {
        expect(await revokeMachineToken('bot-1', 't1')).toEqual([{ id: 't1' }]);
        expect(mockRevoke).toHaveBeenCalledWith('bot-1', 't1');
    });
});
