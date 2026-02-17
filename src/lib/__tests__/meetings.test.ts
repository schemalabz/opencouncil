// Mock auth before importing anything else
jest.mock('../auth', () => ({
  isUserAuthorizedToEdit: jest.fn(),
  withUserAuthorizedToEdit: jest.fn()
}));

// Mock Prisma
jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: {
    councilMeeting: {
      findMany: jest.fn()
    }
  }
}));

import { getCouncilMeetingsForCity } from '../db/meetings';
import prisma from '../db/prisma';

const mockFindMany = prisma.councilMeeting.findMany as jest.MockedFunction<typeof prisma.councilMeeting.findMany>;

describe('getCouncilMeetingsForCity - Pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  it('should fetch first page with 12 items by default', async () => {
    await getCouncilMeetingsForCity('test-city', { page: 1 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 12
      })
    );
  });

  it('should fetch second page with correct skip offset', async () => {
    await getCouncilMeetingsForCity('test-city', { page: 2 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 12,
        take: 12
      })
    );
  });

  it('should respect custom pageSize', async () => {
    await getCouncilMeetingsForCity('test-city', { page: 1, pageSize: 20 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20
      })
    );
  });

  it('should calculate skip correctly for page 3', async () => {
    await getCouncilMeetingsForCity('test-city', { page: 3, pageSize: 10 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10
      })
    );
  });

  it('should work without pagination params (backward compatibility)', async () => {
    await getCouncilMeetingsForCity('test-city', {});

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        skip: expect.anything()
      })
    );
  });

  it('should use limit when page is not provided', async () => {
    await getCouncilMeetingsForCity('test-city', { limit: 5 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5
      })
    );
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        skip: expect.anything()
      })
    );
  });
});
