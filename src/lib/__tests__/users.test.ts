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
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import prisma from '../db/prisma';
import { withUserAuthorizedToEdit, getCurrentUser } from '../auth';
import { createUser, updateUser, deleteUser, deleteCurrentUser } from '../db/users';

const mockWithUserAuthorizedToEdit = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockFindFirst = prisma.user.findFirst as jest.MockedFunction<typeof prisma.user.findFirst>;
const mockCreate = prisma.user.create as jest.MockedFunction<typeof prisma.user.create>;
const mockUpdate = prisma.user.update as jest.MockedFunction<typeof prisma.user.update>;
const mockDelete = prisma.user.delete as jest.MockedFunction<typeof prisma.user.delete>;
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

describe('users db layer - normalization and duplicate handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    // No machine account behind any id unless a test says so.
    mockFindFirst.mockResolvedValue(null);

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

    it('keeps claimedAt on a person the form keeps, and never sets it on a new row', async () => {
      const claimedAt = new Date('2026-09-16T10:00:00Z');
      const tx = {
        administers: {
          findMany: jest.fn().mockResolvedValue([{ personId: 'person-1', claimedAt }]),
          deleteMany: jest.fn(),
        },
        user: { update: mockUpdate },
      };
      mockTransaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) => fn(tx));

      await updateUser('user-1', {
        email: 'user@example.com',
        administers: [{ personId: 'person-1' }, { personId: 'person-2' }, { cityId: 'city-1' }],
      });

      expect(tx.administers.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            administers: {
              create: [{ personId: 'person-1', claimedAt }, { personId: 'person-2' }, { cityId: 'city-1' }],
            },
          }),
        })
      );
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
});
