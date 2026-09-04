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

import { generateUniqueMeetingId } from '../db/meetings';
import { getCouncilMeetingsForCity } from '../db/meetingsList';
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

describe('getCouncilMeetingsForCity - date range and timeFilter', () => {
  const NOW = new Date('2026-08-24T12:00:00.000Z');

  type DateTimeFilter = { gt?: Date; gte?: Date; lte?: Date };

  const dateTimeArg = (): DateTimeFilter | undefined =>
    (mockFindMany.mock.calls[0][0] as { where?: { dateTime?: DateTimeFilter } }).where?.dateTime;

  const orderByArg = (): unknown =>
    (mockFindMany.mock.calls[0][0] as { orderBy?: unknown }).orderBy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    mockFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the past bound when a from date is also given', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    await getCouncilMeetingsForCity('test-city', { from, timeFilter: 'past' });

    expect(dateTimeArg()).toEqual({ gte: from, lte: NOW });
    expect(orderByArg()).toEqual([{ dateTime: 'desc' }, { createdAt: 'desc' }]);
  });

  it('keeps the upcoming bound when a to date is also given', async () => {
    const to = new Date('2026-12-31T23:59:59.999Z');
    await getCouncilMeetingsForCity('test-city', { to, timeFilter: 'upcoming' });

    expect(dateTimeArg()).toEqual({ gt: NOW, lte: to });
    expect(orderByArg()).toEqual([{ dateTime: 'asc' }, { createdAt: 'asc' }]);
  });

  it('uses the to date as the upper bound when it is earlier than now', async () => {
    const to = new Date('2026-06-30T23:59:59.999Z');
    await getCouncilMeetingsForCity('test-city', { to, timeFilter: 'past' });

    expect(dateTimeArg()).toEqual({ lte: to });
  });

  it('uses now as the upper bound when the to date is later than now', async () => {
    await getCouncilMeetingsForCity('test-city', {
      to: new Date('2026-12-31T23:59:59.999Z'),
      timeFilter: 'past',
    });

    expect(dateTimeArg()).toEqual({ lte: NOW });
  });

  it('applies a from/to range on its own', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');
    await getCouncilMeetingsForCity('test-city', { from, to });

    expect(dateTimeArg()).toEqual({ gte: from, lte: to });
  });

  it('applies timeFilter on its own', async () => {
    await getCouncilMeetingsForCity('test-city', { timeFilter: 'past' });

    expect(dateTimeArg()).toEqual({ lte: NOW });
  });

  it('sets no dateTime filter when neither is given', async () => {
    await getCouncilMeetingsForCity('test-city', {});

    expect(dateTimeArg()).toBeUndefined();
  });
});

describe('generateUniqueMeetingId', () => {
  const april20 = new Date('2026-04-20T12:00:00+03:00');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns base ID when no collisions exist', async () => {
    mockFindMany.mockResolvedValue([]);
    const id = await generateUniqueMeetingId('city-1', april20);
    expect(id).toBe('apr20_2026');
  });

  it('returns _2 suffix when base ID exists', async () => {
    mockFindMany.mockResolvedValue([{ id: 'apr20_2026' }] as never);
    const id = await generateUniqueMeetingId('city-1', april20);
    expect(id).toBe('apr20_2026_2');
  });

  it('skips over existing suffixes', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'apr20_2026' },
      { id: 'apr20_2026_2' },
      { id: 'apr20_2026_3' },
    ] as never);
    const id = await generateUniqueMeetingId('city-1', april20);
    expect(id).toBe('apr20_2026_4');
  });

  it('handles gaps in suffixes', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'apr20_2026' },
      { id: 'apr20_2026_3' },
    ] as never);
    const id = await generateUniqueMeetingId('city-1', april20);
    expect(id).toBe('apr20_2026_2');
  });

  it('throws when all 20 suffixes are exhausted', async () => {
    const existing = [{ id: 'apr20_2026' }];
    for (let i = 2; i <= 20; i++) {
      existing.push({ id: `apr20_2026_${i}` });
    }
    mockFindMany.mockResolvedValue(existing as never);
    await expect(generateUniqueMeetingId('city-1', april20)).rejects.toThrow(
      'Could not generate unique meeting ID'
    );
  });

  it('queries with the correct cityId and startsWith filter', async () => {
    mockFindMany.mockResolvedValue([]);
    await generateUniqueMeetingId('chania', april20);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        cityId: 'chania',
        id: { startsWith: 'apr20_2026' },
      },
      select: { id: true },
    });
  });
});
