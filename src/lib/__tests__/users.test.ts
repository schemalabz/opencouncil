jest.mock('../api/errors', () => {
  class ApiError extends Error {
    constructor(public readonly statusCode: number, message: string) {
      super(message);
      this.name = this.constructor.name;
    }
  }
  class ConflictError extends ApiError {
    constructor(message: string = "Conflict") {
      super(409, message);
    }
  }
  class BadRequestError extends ApiError {
    constructor(message: string = "Invalid request") {
      super(400, message);
    }
  }
  class NotFoundError extends ApiError {
    constructor(message: string = "Not found") {
      super(404, message);
    }
  }
  return { ApiError, BadRequestError, ConflictError, NotFoundError };
});

jest.mock('../auth', () => ({
  withUserAuthorizedToEdit: jest.fn(),
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/discord', () => ({
  sendAccountDeletedAdminAlert: jest.fn(),
}));

jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    administers: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import { withUserAuthorizedToEdit, getCurrentUser } from '../auth';
import { sendAccountDeletedAdminAlert } from '@/lib/discord';
import { createUser, updateUser, deleteUser, deleteCurrentUser } from '../db/users';

const mockWithUserAuthorizedToEdit = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockFindFirst = prisma.user.findFirst as jest.MockedFunction<typeof prisma.user.findFirst>;
const mockCreate = prisma.user.create as jest.MockedFunction<typeof prisma.user.create>;
const mockUpdate = prisma.user.update as jest.MockedFunction<typeof prisma.user.update>;
const mockDelete = prisma.user.delete as jest.MockedFunction<typeof prisma.user.delete>;
const mockHeldRoles = prisma.administers.findMany as unknown as jest.Mock;
const mockDeletedAlert = sendAccountDeletedAdminAlert as jest.MockedFunction<typeof sendAccountDeletedAdminAlert>;
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

describe('users db layer - normalization and duplicate handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    // No machine account behind any id unless a test says so.
    mockFindFirst.mockResolvedValue(null);
    // An account with no roles, unless a test gives it some.
    mockHeldRoles.mockResolvedValue([]);

    const mockedUser = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isSuperAdmin: false,
      onboarded: false,
      administers: [],
    };

    mockCreate.mockResolvedValue(mockedUser as unknown as Awaited<ReturnType<typeof createUser>>);
    mockUpdate.mockResolvedValue(mockedUser as unknown as Awaited<ReturnType<typeof updateUser>>);
    mockTransaction.mockImplementation(
      async (operations: ReadonlyArray<Promise<unknown>>) => Promise.all(operations)
    );
  });

  describe('createUser', () => {
    it('normalizes email/name before create', async () => {
      await createUser({
        email: '  USER@Example.COM  ',
        name: '  Alice  ',
        isSuperAdmin: true,
      });

      expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({});
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'user@example.com',
            name: 'Alice',
            isSuperAdmin: true,
          }),
        })
      );
    });

    it('stores empty name as null', async () => {
      await createUser({
        email: 'new@example.com',
        name: '   ',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: null,
          }),
        })
      );
    });

    it('maps Prisma P2002 create error to ConflictError', async () => {
      mockCreate.mockRejectedValueOnce({ code: 'P2002' } as { code: string });

      await expect(
        createUser({
          email: 'duplicate@example.com',
        })
      ).rejects.toThrow('A user with this email already exists.');
    });

    it('tells a duplicate grant apart from a duplicate email', async () => {
      mockCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002', clientVersion: 'test', meta: { modelName: 'User', target: ['userId', 'role', 'cityId'] },
      }));

      await expect(
        createUser({ email: 'new@example.com', administers: [{ cityId: 'city-1' }, { cityId: 'city-1' }] })
      ).rejects.toThrow('An account cannot hold the same role on the same scope two times.');
    });

    it('checks authorization even when a caller passes the retired skipAuthCheck option', async () => {
      // This is a "use server" module, so a client can call it with any arguments.
      const callAsClient = createUser as (...args: unknown[]) => Promise<unknown>;
      await callAsClient({ email: 'skip-auth@example.com' }, { skipAuthCheck: true });
      expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({});
    });

    it('throws BadRequestError for empty email', async () => {
      await expect(
        createUser({ email: '   ' })
      ).rejects.toThrow('Email cannot be empty');
    });

    it('throws BadRequestError when email is missing', async () => {
      await expect(
        createUser({ name: 'No Email' })
      ).rejects.toThrow('Email is required to create a user');
    });

    it('masks non-P2002 errors with generic message', async () => {
      mockCreate.mockRejectedValueOnce(new Error('connection failed'));

      await expect(
        createUser({ email: 'test@example.com' })
      ).rejects.toThrow('Failed to create user');
    });
  });

  describe('updateUser', () => {
    it('normalizes email/name before update', async () => {
      await updateUser('user-1', {
        email: '  USER@Example.COM  ',
        name: '  Bob  ',
      });

      expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({});
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            email: 'user@example.com',
            name: 'Bob',
          }),
        })
      );
    });

    it('stores empty name as null on update', async () => {
      await updateUser('user-1', {
        email: 'name-null@example.com',
        name: '   ',
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: null,
          }),
        })
      );
    });

    it('maps Prisma P2002 update error to ConflictError', async () => {
      mockUpdate.mockRejectedValueOnce({ code: 'P2002' } as { code: string });

      await expect(
        updateUser('user-1', {
          email: 'duplicate@example.com',
        })
      ).rejects.toThrow('A user with this email already exists.');
    });

    it('masks non-P2002 errors with generic message', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('connection failed'));

      await expect(
        updateUser('user-1', { email: 'test@example.com' })
      ).rejects.toThrow('Failed to update user');
    });

    it('maps Prisma P2025 update error to NotFoundError', async () => {
      mockUpdate.mockRejectedValueOnce({ code: 'P2025' } as { code: string });

      await expect(
        updateUser('non-existent', { email: 'notfound@example.com' })
      ).rejects.toThrow('User not found');
    });

    // The rows as the writer reads them back: a role at one scope.
    const row = (id: string, scope: Partial<Record<'realm' | 'cityId' | 'partyId' | 'personId' | 'administrativeBodyId', string>>, role = 'admin') =>
      ({ id, role, realm: null, cityId: null, partyId: null, personId: null, administrativeBodyId: null, ...scope });

    const withGrants = (existing: (ReturnType<typeof row> & { claimedAt?: Date })[], signedIn = true) => {
      const tx = {
        administers: {
          findMany: jest.fn().mockResolvedValue(existing),
          updateMany: jest.fn(),
          update: jest.fn(),
        },
        user: {
          update: mockUpdate,
          findUnique: jest.fn().mockResolvedValue({ emailVerified: signedIn ? new Date() : null, _count: { accounts: 0, sessions: 0 } }),
        },
      };
      mockTransaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) => fn(tx));
      return tx;
    };

    it('keeps the grants the form keeps, revokes the ones it drops, and creates the new ones', async () => {
      const tx = withGrants([row('g1', { personId: 'person-1' }), row('g2', { cityId: 'old-city' })]);
      mockGetCurrentUser.mockResolvedValueOnce({ id: 'root' } as unknown as Awaited<ReturnType<typeof getCurrentUser>>);

      await updateUser('user-1', {
        email: 'user@example.com',
        administers: [{ personId: 'person-1' }, { personId: 'person-2' }, { cityId: 'city-1' }],
      });

      expect(tx.administers.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }));
      expect(tx.administers.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['g2'] } },
        data: { revokedAt: expect.any(Date), revokedById: 'root' },
      });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            administers: {
              create: [
                { personId: 'person-2', acceptedAt: expect.any(Date), grantedById: 'root' },
                { cityId: 'city-1', acceptedAt: expect.any(Date), grantedById: 'root' },
              ],
            },
          }),
        })
      );
    });

    it('keeps a new row pending for an account that never signed in', async () => {
      const tx = withGrants([], false);
      await updateUser('user-1', { email: 'user@example.com', administers: [{ cityId: 'city-1' }] });
      expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ administers: { create: [{ cityId: 'city-1', acceptedAt: null, grantedById: undefined }] } }),
      }));
    });

    it('treats the role as part of the grant: a new role on the same scope is a new grant', async () => {
      const tx = withGrants([row('g1', { cityId: 'city-1' })]);

      await updateUser('user-1', { administers: [{ role: 'records', cityId: 'city-1' }] });

      expect(tx.administers.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['g1'] } } }));
      expect(mockUpdate.mock.calls[0][0].data.administers).toEqual({
        create: [{ role: 'records', cityId: 'city-1', acceptedAt: expect.any(Date), grantedById: undefined }],
      });
    });

    it('moves the claim to the new row when the role of a claimed person changes', async () => {
      const claimedAt = new Date('2026-05-01');
      const tx = withGrants([{ ...row('g1', { personId: 'person-1' }), claimedAt }]);

      await updateUser('user-1', { administers: [{ role: 'records', personId: 'person-1' }] });

      expect(tx.administers.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['g1'] } } }));
      expect(mockUpdate.mock.calls[0][0].data.administers).toEqual({
        create: [{ role: 'records', personId: 'person-1', acceptedAt: expect.any(Date), grantedById: undefined, claimedAt }],
      });
    });

    it('moves the claim to a kept row when the form drops the claimed role and adds none', async () => {
      const claimedAt = new Date('2026-05-01');
      const tx = withGrants([{ ...row('g1', { personId: 'person-1' }), claimedAt }, row('g2', { personId: 'person-1' }, 'records')]);

      await updateUser('user-1', { administers: [{ role: 'records', personId: 'person-1' }] });

      expect(tx.administers.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['g1'] } } }));
      expect(tx.administers.update).toHaveBeenCalledWith({ where: { id: 'g2' }, data: { claimedAt } });
      expect(mockUpdate.mock.calls[0][0].data.administers).toEqual({ create: [] });
    });

    it('lets the claim go with the last row of the person', async () => {
      const tx = withGrants([{ ...row('g1', { personId: 'person-1' }), claimedAt: new Date('2026-05-01') }]);

      await updateUser('user-1', { administers: [] });

      expect(tx.administers.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['g1'] } } }));
      expect(tx.administers.update).not.toHaveBeenCalled();
    });

    it('revokes nothing and creates nothing when the form matches the rows', async () => {
      const tx = withGrants([row('g1', { realm: 'greece' }), row('g2', { cityId: 'city-1' }, 'viewer')]);

      await updateUser('user-1', { administers: [{ role: 'viewer', cityId: 'city-1' }, { role: 'admin', realm: 'greece' }] });

      expect(tx.administers.updateMany).not.toHaveBeenCalled();
      expect(mockUpdate.mock.calls[0][0].data.administers).toEqual({ create: [] });
    });

    it('maps P2002 error to ConflictError in transaction path', async () => {
      mockTransaction.mockRejectedValueOnce({ code: 'P2002' });

      await expect(
        updateUser('user-1', {
          email: 'duplicate@example.com',
          administers: [{ cityId: 'city-1' }],
        })
      ).rejects.toThrow('A user with this email already exists.');
    });

    it('masks non-P2002 errors in transaction path', async () => {
      mockTransaction.mockRejectedValueOnce(new Error('tx failed'));

      await expect(
        updateUser('user-1', {
          email: 'test@example.com',
          administers: [{ cityId: 'city-1' }],
        })
      ).rejects.toThrow('Failed to update user');
    });
  });

  describe('machine accounts', () => {
    const MACHINE = { id: 'bot-1', name: 'Paola', email: 'paola@machines.opencouncil.invalid' };

    it('never gives a person an address of the machine domain', async () => {
      await expect(createUser({ email: 'me@machines.opencouncil.invalid' })).rejects.toThrow('reserved');
      await expect(updateUser('user-1', { email: 'me@machines.opencouncil.invalid' })).rejects.toThrow('reserved');
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('keeps the address of a machine account, and lets its name and rights change', async () => {
      mockFindFirst.mockResolvedValue(MACHINE as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);

      await expect(updateUser('bot-1', { email: 'paola@example.com' })).rejects.toThrow('cannot change');
      expect(mockUpdate).not.toHaveBeenCalled();

      await updateUser('bot-1', { name: 'Paola 2', isSuperAdmin: false });
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Paola 2', isSuperAdmin: false } }));
    });

    it('writes only the fields of the form, so a direct call cannot turn a person into a machine account', async () => {
      // updateUser is a Server Action: a client can post any object to it.
      await updateUser('user-1', { name: 'Anna', isMachine: true } as unknown as Parameters<typeof updateUser>[1]);
      expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('isMachine');
    });

    it('refuses to delete a machine account, from the admin and from the account itself', async () => {
      mockFindFirst.mockResolvedValue(MACHINE as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);
      await expect(deleteUser('bot-1')).rejects.toThrow('retired by revoking its tokens');

      mockGetCurrentUser.mockResolvedValue({ id: 'bot-1', isMachine: true } as unknown as Awaited<ReturnType<typeof getCurrentUser>>);
      await expect(deleteCurrentUser()).rejects.toThrow('retired by revoking its tokens');
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('maps Prisma P2025 delete error to NotFoundError', async () => {
      mockDelete.mockRejectedValueOnce({ code: 'P2025' } as { code: string });

      await expect(deleteUser('nonexistent')).rejects.toThrow('User not found');
    });

    it('masks non-P2025 errors with generic message', async () => {
      mockDelete.mockRejectedValueOnce(new Error('connection failed'));

      await expect(deleteUser('user-1')).rejects.toThrow('Failed to delete user');
    });
  });

  describe('the alert on the deletion of an account that held roles', () => {
    const city = { id: 'athens', name: 'Athens' };
    const held = [
      { role: 'admin', realm: null, city, administrativeBody: null, party: null, person: null },
      { role: 'records', realm: null, city: null, administrativeBody: { id: 'b1', name: 'Finance', cityId: 'athens', city: { name: 'Athens' } }, party: null, person: null },
    ];

    it('names each role and its scope, with no personal data, when a superadmin deletes the account', async () => {
      mockHeldRoles.mockResolvedValue(held);
      await deleteUser('user-1');
      expect(mockHeldRoles).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1', acceptedAt: { not: null }, revokedAt: null },
      }));
      expect(mockDeletedAlert).toHaveBeenCalledWith({
        deletedBy: 'superadmin',
        roles: [
          { role: 'admin', scope: 'Athens' },
          { role: 'records', scope: 'Finance, Athens' },
        ],
      });
    });

    it('says that the account deleted itself', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: 'user-1', isMachine: false } as unknown as Awaited<ReturnType<typeof getCurrentUser>>);
      mockHeldRoles.mockResolvedValue(held);
      await deleteCurrentUser();
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(mockDeletedAlert).toHaveBeenCalledWith(expect.objectContaining({ deletedBy: 'self' }));
    });

    it('sends nothing for an account that held no role: a reader leaving is not an admin event', async () => {
      await deleteUser('user-1');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockDeletedAlert).not.toHaveBeenCalled();
    });

    it('sends nothing when the delete fails: the alert reports a deletion that happened', async () => {
      mockHeldRoles.mockResolvedValue(held);
      mockDelete.mockRejectedValueOnce(new Error('connection failed'));
      await expect(deleteUser('user-1')).rejects.toThrow('Failed to delete user');
      expect(mockDeletedAlert).not.toHaveBeenCalled();
    });
  });
});
