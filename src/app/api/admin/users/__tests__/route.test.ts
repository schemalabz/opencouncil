/** @jest-environment node */
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    getCurrentUser: jest.fn(async () => ({ id: 'root', name: 'Root', email: 'root@example.com' })),
}));
jest.mock('@/lib/db/users', () => ({
    createUser: jest.fn(),
    getUsers: jest.fn(),
    updateUser: jest.fn(),
}));
jest.mock('@/lib/db/machineAccounts', () => ({ createMachineAccount: jest.fn() }));
jest.mock('@/lib/discord', () => ({ sendUserOnboardedAdminAlert: jest.fn() }));
jest.mock('@/lib/auth/invite', () => ({ sendInviteEmail: jest.fn() }));

import { POST } from '../route';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { ForbiddenError } from '@/lib/api/errors';
import { createUser } from '@/lib/db/users';
import { createMachineAccount } from '@/lib/db/machineAccounts';
import { sendInviteEmail } from '@/lib/auth/invite';
import { sendUserOnboardedAdminAlert } from '@/lib/discord';

const mockCreateMachine = createMachineAccount as jest.MockedFunction<typeof createMachineAccount>;
const mockCreateUser = createUser as jest.MockedFunction<typeof createUser>;
const mockInvite = sendInviteEmail as jest.MockedFunction<typeof sendInviteEmail>;

const post = (body: unknown) => POST(new Request('http://localhost/api/admin/users', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

describe('POST /api/admin/users', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInvite.mockResolvedValue(true);
    });

    it('creates a machine account from its label, without an invite', async () => {
        const account = { id: 'bot-1', email: 'paola@machines.opencouncil.invalid', name: 'Paola', isMachine: true };
        mockCreateMachine.mockResolvedValue(account as unknown as Awaited<ReturnType<typeof createMachineAccount>>);

        const response = await post({ isMachine: true, label: 'Paola', isSuperAdmin: true, administers: [] });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ id: 'bot-1' });
        expect(mockCreateMachine).toHaveBeenCalledWith({ isMachine: true, label: 'Paola', isSuperAdmin: true, administers: [] });
        expect(mockCreateUser).not.toHaveBeenCalled();
        expect(mockInvite).not.toHaveBeenCalled();
        expect(sendUserOnboardedAdminAlert).not.toHaveBeenCalled();
    });

    it('refuses a machine label that gives no address', async () => {
        const response = await post({ isMachine: true, label: 'Παόλα', isSuperAdmin: true });

        expect(response.status).toBe(400);
        expect(mockCreateMachine).not.toHaveBeenCalled();
    });

    it('refuses isMachine as a string, rather than reading the body as a person', async () => {
        const response = await post({ isMachine: 'true', label: 'Paola', email: 'bot@example.com', name: null, isSuperAdmin: true });

        expect(response.status).toBe(400);
        expect(mockCreateUser).not.toHaveBeenCalled();
        expect(mockCreateMachine).not.toHaveBeenCalled();
        expect(mockInvite).not.toHaveBeenCalled();
    });

    it('refuses a caller who is not a superadmin before it creates a machine account', async () => {
        (withUserAuthorizedToEdit as jest.Mock).mockRejectedValueOnce(new ForbiddenError());

        const response = await post({ isMachine: true, label: 'Paola', isSuperAdmin: true, administers: [] });

        expect(response.status).toBe(403);
        expect(withUserAuthorizedToEdit).toHaveBeenCalledWith({});
        expect(mockCreateMachine).not.toHaveBeenCalled();
    });

    it('still invites a person', async () => {
        mockCreateUser.mockResolvedValue({ id: 'u1', email: 'reader@example.com', name: null, administers: [] } as unknown as Awaited<ReturnType<typeof createUser>>);

        const response = await post({ email: 'reader@example.com', name: null, isSuperAdmin: false, administers: [] });

        expect(response.status).toBe(200);
        // No role waits for the sign-in, so the email gives no time limit.
        expect(mockInvite).toHaveBeenCalledWith({ email: 'reader@example.com', name: null, realm: null, invitedBy: 'Root', pending: false });
        expect(mockCreateMachine).not.toHaveBeenCalled();
    });

    it('tells a person with a pending role that the invite waits, on the realm of the role', async () => {
        const pendingRow = { createdAt: new Date(), acceptedAt: null, realm: null, city: { id: 'athens', realm: 'greece' }, administrativeBody: null, party: null, person: null };
        mockCreateUser.mockResolvedValue({ id: 'u1', email: 'clerk@example.com', name: 'Clerk', administers: [pendingRow] } as unknown as Awaited<ReturnType<typeof createUser>>);

        await post({ email: 'clerk@example.com', name: 'Clerk', isSuperAdmin: false, administers: [{ role: 'records', cityId: 'athens' }] });

        expect(mockInvite).toHaveBeenCalledWith(expect.objectContaining({ email: 'clerk@example.com', realm: 'greece', pending: true }));
    });
});
