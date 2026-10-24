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
}));

jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
import { withUserAuthorizedToEdit } from '../auth';
import { createUser, updateUser, deleteUser, isUserOnboardedByEmail } from '../db/users';
import type { User } from '@prisma/client';

const buildUserFixture = (fields: Partial<User>): User => ({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test',
  emailVerified: null,
  phone: null,
  phoneVerifiedAt: null,
  onboarded: false,
  allowProductUpdates: true,
  allowPetitionUpdates: false,
  allowFeedbackCalls: true,
  notifyByPhone: true,
  isSuperAdmin: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...fields,
});

const mockWithUserAuthorizedToEdit = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockFindUnique = prisma.user.findUnique as jest.MockedFunction<typeof prisma.user.findUnique>;
const mockCreate = prisma.user.create as jest.MockedFunction<typeof prisma.user.create>;
const mockUpdate = prisma.user.update as jest.MockedFunction<typeof prisma.user.update>;
const mockDelete = prisma.user.delete as jest.MockedFunction<typeof prisma.user.delete>;
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

describe('users db layer - normalization and duplicate handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockWithUserAuthorizedToEdit.mockResolvedValue(true);

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

    it('skips auth check when skipAuthCheck is enabled and dev tools are allowed', async () => {
      const prev = process.env.DEPLOYMENT_ENV;
      process.env.DEPLOYMENT_ENV = 'development';
      try {
        await createUser(
          {
            email: 'skip-auth@example.com',
          },
          { skipAuthCheck: true }
        );

        expect(mockWithUserAuthorizedToEdit).not.toHaveBeenCalled();
      } finally {
        process.env.DEPLOYMENT_ENV = prev;
      }
    });

    it('rejects skipAuthCheck when dev tools are not allowed (production)', async () => {
      const prev = process.env.DEPLOYMENT_ENV;
      process.env.DEPLOYMENT_ENV = 'production';
      try {
        await expect(
          createUser({ email: 'skip-auth-prod@example.com' }, { skipAuthCheck: true })
        ).rejects.toThrow('skipAuthCheck is only permitted');
        // The bypass must not create the user.
        expect(prisma.user.create).not.toHaveBeenCalled();
      } finally {
        process.env.DEPLOYMENT_ENV = prev;
      }
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

  describe('isUserOnboardedByEmail', () => {
    it('returns true when user exists, is onboarded, and has a name', async () => {
      mockFindUnique.mockResolvedValueOnce(buildUserFixture({ onboarded: true, name: 'Alice' }));

      const result = await isUserOnboardedByEmail('alice@example.com');
      expect(result).toBe(true);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
        select: { onboarded: true, name: true },
      });
    });

    it('returns false when user exists but is not onboarded', async () => {
      mockFindUnique.mockResolvedValueOnce(buildUserFixture({ onboarded: false, name: 'Bob' }));

      const result = await isUserOnboardedByEmail('bob@example.com');
      expect(result).toBe(false);
    });

    it('returns false when user exists but has no name set', async () => {
      mockFindUnique.mockResolvedValueOnce(buildUserFixture({ onboarded: true, name: null }));

      const result = await isUserOnboardedByEmail('noname@example.com');
      expect(result).toBe(false);
    });

    it('returns false when user does not exist in database', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const result = await isUserOnboardedByEmail('unknown@example.com');
      expect(result).toBe(false);
    });

    it('returns false and skips query for empty or whitespace-only email', async () => {
      const result = await isUserOnboardedByEmail('   ');
      expect(result).toBe(false);
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('normalizes email casing and surrounding whitespace', async () => {
      mockFindUnique.mockResolvedValueOnce(buildUserFixture({ onboarded: true, name: 'Charlie' }));

      await isUserOnboardedByEmail('  Charlie@Example.COM  ');
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { email: 'charlie@example.com' },
        select: { onboarded: true, name: true },
      });
    });
  });
});
