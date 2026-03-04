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
  return { ApiError, BadRequestError, ConflictError };
});

jest.mock('../auth', () => ({
  withUserAuthorizedToEdit: jest.fn(),
}));

jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    administers: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import prisma from '../db/prisma';
import { withUserAuthorizedToEdit } from '../auth';
import { createUser, updateUser } from '../db/users';

const mockWithUserAuthorizedToEdit = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockCreate = prisma.user.create as jest.MockedFunction<typeof prisma.user.create>;
const mockUpdate = prisma.user.update as jest.MockedFunction<typeof prisma.user.update>;
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

describe('users db layer - normalization and duplicate handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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

    it('skips auth check when skipAuthCheck is enabled', async () => {
      await createUser(
        {
          email: 'skip-auth@example.com',
        },
        { skipAuthCheck: true }
      );

      expect(mockWithUserAuthorizedToEdit).not.toHaveBeenCalled();
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

    it('maps P2002 error to ConflictError in transaction path', async () => {
      mockTransaction.mockRejectedValueOnce({ code: 'P2002' });

      await expect(
        updateUser('user-1', {
          email: 'duplicate@example.com',
          administers: [{ city: { connect: { id: 'city-1' } } }],
        })
      ).rejects.toThrow('A user with this email already exists.');
    });

    it('masks non-P2002 errors in transaction path', async () => {
      mockTransaction.mockRejectedValueOnce(new Error('tx failed'));

      await expect(
        updateUser('user-1', {
          email: 'test@example.com',
          administers: [{ city: { connect: { id: 'city-1' } } }],
        })
      ).rejects.toThrow('Failed to update user');
    });
  });
});
