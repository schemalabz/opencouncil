/**
 * The single-request rules of removeBodyAdmin. The concurrent case needs the
 * row lock of a real database (tests/integration/body-admins.test.ts); who may
 * remove the last admin does not.
 */
const mockWithUserAuthorizedToEdit = jest.fn();
const mockIsUserAuthorizedToEdit = jest.fn();
const mockBodyFindUnique = jest.fn();
const mockAdministersFindMany = jest.fn();
const mockAdministersDelete = jest.fn();

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...a: unknown[]) => mockWithUserAuthorizedToEdit(...a),
    isUserAuthorizedToEdit: (...a: unknown[]) => mockIsUserAuthorizedToEdit(...a),
}));
jest.mock('@/lib/auth/invite', () => ({ sendInviteEmail: jest.fn() }));
jest.mock('@/lib/db/prisma', () => {
    const tx = {
        $queryRaw: jest.fn(),
        administers: {
            findMany: (...a: unknown[]) => mockAdministersFindMany(...a),
            delete: (...a: unknown[]) => mockAdministersDelete(...a),
        },
    };
    return {
        __esModule: true,
        default: {
            administrativeBody: { findUnique: (...a: unknown[]) => mockBodyFindUnique(...a) },
            $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
        },
    };
});

import { addBodyAdmin, removeBodyAdmin } from '@/lib/db/bodyAdmins';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';

const ME = { id: 'a1', userId: 'me', user: { isMachine: false } };
const COLLEAGUE = { id: 'a2', userId: 'colleague', user: { isMachine: false } };
const MACHINE = { id: 'a3', userId: 'bot-1', user: { isMachine: true } };

beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    mockBodyFindUnique.mockResolvedValue({ cityId: 'athens' });
});

describe('removeBodyAdmin', () => {
    it('asks for the body, not the city, to manage its admins', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(false);
        mockAdministersFindMany.mockResolvedValue([ME, COLLEAGUE]);
        await removeBodyAdmin('athens', 'youth', 'colleague');
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'athens', administrativeBodyId: 'youth' });
    });

    it('removes nothing for a caller who may not manage the body', async () => {
        mockWithUserAuthorizedToEdit.mockRejectedValue(new ForbiddenError('Not authorized'));
        await expect(removeBodyAdmin('athens', 'youth', 'colleague')).rejects.toThrow(ForbiddenError);
        expect(mockAdministersDelete).not.toHaveBeenCalled();
    });

    it('lets a body admin remove a colleague but not the last admin', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(false);

        mockAdministersFindMany.mockResolvedValue([ME, COLLEAGUE]);
        await removeBodyAdmin('athens', 'youth', 'colleague');
        expect(mockAdministersDelete).toHaveBeenCalledWith({ where: { id: 'a2' } });

        mockAdministersDelete.mockClear();
        mockAdministersFindMany.mockResolvedValue([ME]);
        await expect(removeBodyAdmin('athens', 'youth', 'me')).rejects.toThrow(BadRequestError);
        expect(mockAdministersDelete).not.toHaveBeenCalled();
    });

    it('lets a city admin remove the last admin', async () => {
        mockIsUserAuthorizedToEdit.mockImplementation(async (scope: object) => JSON.stringify(scope) === JSON.stringify({ cityId: 'athens' }));
        mockAdministersFindMany.mockResolvedValue([ME]);
        await removeBodyAdmin('athens', 'youth', 'me');
        expect(mockAdministersDelete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    });
});

// The auth mock answers like the real rules for a body admin
// of youth (the body scope yes, the city scope no), so the test sees which
// scope removeBodyAdmin asks before it lets the last admin go.
describe('removeBodyAdmin with the rules of a body admin', () => {
    const asBodyAdmin = async (scope: { cityId?: string; administrativeBodyId?: string }) =>
        scope.cityId === 'athens' && scope.administrativeBodyId === 'youth';

    it('keeps the last admin', async () => {
        mockWithUserAuthorizedToEdit.mockImplementation(async (scope: object) => {
            if (!(await asBodyAdmin(scope))) throw new ForbiddenError('Not authorized');
            return true;
        });
        mockIsUserAuthorizedToEdit.mockImplementation(asBodyAdmin);
        mockAdministersFindMany.mockResolvedValue([ME]);
        await expect(removeBodyAdmin('athens', 'youth', 'me')).rejects.toThrow(BadRequestError);
        expect(mockAdministersDelete).not.toHaveBeenCalled();
    });
});

describe('addBodyAdmin', () => {
    it('refuses an address on the machine domain before any account is read or created', async () => {
        // A machine account gets its rights from a superadmin only.
        await expect(addBodyAdmin('athens', 'council', { email: 'Paola@machines.opencouncil.invalid' })).rejects.toThrow(BadRequestError);
        expect(mockAdministersFindMany).not.toHaveBeenCalled();
    });
});

describe('removeBodyAdmin and a machine account', () => {
    // A body admin of youth: the body scope yes, the city and superadmin scopes no.
    const asBodyAdmin = async (scope: { cityId?: string; administrativeBodyId?: string }) =>
        scope.cityId === 'athens' && scope.administrativeBodyId === 'youth';

    beforeEach(() => mockIsUserAuthorizedToEdit.mockImplementation(asBodyAdmin));

    it("refuses a body admin who removes a machine account's grant", async () => {
        mockAdministersFindMany.mockResolvedValue([ME, MACHINE]);
        await expect(removeBodyAdmin('athens', 'youth', 'bot-1')).rejects.toThrow(ForbiddenError);
        expect(mockAdministersDelete).not.toHaveBeenCalled();
    });

    it("lets a superadmin remove a machine account's grant", async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(true);
        mockAdministersFindMany.mockResolvedValue([ME, MACHINE]);
        await removeBodyAdmin('athens', 'youth', 'bot-1');
        expect(mockAdministersDelete).toHaveBeenCalledWith({ where: { id: 'a3' } });
    });

    it('does not count a machine account as an admin a person can leave the body to', async () => {
        mockAdministersFindMany.mockResolvedValue([ME, MACHINE]);
        await expect(removeBodyAdmin('athens', 'youth', 'me')).rejects.toThrow(BadRequestError);
        expect(mockAdministersDelete).not.toHaveBeenCalled();
    });
});
