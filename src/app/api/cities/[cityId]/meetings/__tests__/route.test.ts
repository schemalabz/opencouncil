/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ withServiceOrUserAuth: jest.fn() }));
jest.mock('@/lib/db/meetingsList', () => ({ getCouncilMeetingsForCity: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/meetingWrites', () => ({ createMeetingWithEffects: jest.fn() }));
// The public list reads the original date of a postponed meeting.
jest.mock('@/lib/db/meetingLifecycle', () => ({ originalScheduledDates: jest.fn().mockResolvedValue(new Map()) }));
// A date-only bound reads in City.timezone.
jest.mock('@/lib/db/cityTimezone', () => ({ getCityTimezone: jest.fn().mockResolvedValue('Europe/Athens') }));

import { GET } from '@/app/api/cities/[cityId]/meetings/route';
import { withServiceOrUserAuth } from '@/lib/auth';
import { getCouncilMeetingsForCity } from '@/lib/db/meetingsList';

const mockList = getCouncilMeetingsForCity as jest.MockedFunction<typeof getCouncilMeetingsForCity>;

const get = (query: string) => GET(
    new NextRequest(`http://localhost/api/cities/athens/meetings${query}`),
    { params: Promise.resolve({ cityId: 'athens' }) },
);

describe('GET /api/cities/[cityId]/meetings includeUnreleased', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['', false],
        ['?includeUnreleased=true', true],
        ['?includeUnreleased=1', true],
        ['?includeUnreleased=false', false],
    ])('%s reads as %s, and asks for auth only when true', async (query, expected) => {
        const response = await get(query);
        expect(response.status).toBe(200);
        expect(mockList).toHaveBeenCalledWith('athens', expect.objectContaining({ includeUnreleased: expected }));
        expect(withServiceOrUserAuth).toHaveBeenCalledTimes(expected ? 1 : 0);
    });

    it('refuses a value outside the stringbool lists', async () => {
        const response = await get('?includeUnreleased=maybe');
        expect(response.status).toBe(400);
        expect(mockList).not.toHaveBeenCalled();
    });
});

// The list shares the date and limit rules of the subject listings
// (zod-schemas/listQuery.ts). Before, it read both with `new Date()` and
// `parseInt`. The comment on each case gives the old outcome.
describe('GET /api/cities/[cityId]/meetings date range and limit', () => {
    beforeEach(() => jest.clearAllMocks());

    const listOptions = () => mockList.mock.calls[0][1] ?? {};

    it.each([
        // Old: 2026-04-30T00:00:00.000Z, which dropped every meeting held on
        // the 30th. Then 23:59:59.999Z, the end of the UTC day.
        ['?to=2026-04-30', 'to', '2026-04-30T20:59:59.999Z'],
        // The Sentinel agent sends date-only bounds with includeUnreleased.
        ['?includeUnreleased=true&from=2026-04-01&to=2026-04-30', 'to', '2026-04-30T20:59:59.999Z'],
        // Old: 2026-04-01T00:00:00.000Z, the start of the UTC day.
        ['?from=2026-04-01', 'from', '2026-03-31T21:00:00.000Z'],
        // Unchanged.
        ['?to=2026-04-30T09:00:00.000Z', 'to', '2026-04-30T09:00:00.000Z'],
        ['?from=2026-04-30T09:00:00%2B03:00', 'from', '2026-04-30T06:00:00.000Z'],
        // Old: 200. Then 400, because zod wanted seconds with a zone.
        ['?from=2026-04-30T09:00%2B03:00', 'from', '2026-04-30T06:00:00.000Z'],
    ] as const)('%s reads %s as %s', async (query, bound, expected) => {
        const response = await get(query);
        expect(response.status).toBe(200);
        expect(listOptions()[bound]?.toISOString()).toBe(expected);
    });

    // Measured on staging: the Chania meeting "26/02/25" is stored at
    // 2025-02-25T22:00:00Z, 00:00 in Athens. With UTC days it was listed on
    // the 25th and missing from the 26th.
    it.each([
        ['2025-02-26', true],
        ['2025-02-25', false],
    ])('a meeting at Athens midnight on 26 February is on the day %s: %s', async (day, listed) => {
        await get(`?from=${day}&to=${day}`);
        const { from, to } = listOptions();
        const meeting = new Date('2025-02-25T22:00:00.000Z');
        expect(from! <= meeting && meeting <= to!).toBe(listed);
    });

    it.each([
        // Old: 200, rolled over to 3 March.
        ['?to=2026-02-31'],
        // Old: 200, read in the server's zone.
        ['?from=October%205,%202026'],
        ['?from=2026-10-05%2018:00:00'],
        ['?from=2026-10-05T18:00:00'],
        ['?to=2026-10-05T18:00'],
        // Old: 200 with limit 10 and limit 1.
        ['?limit=10abc'],
        ['?limit=1.5'],
        // Unchanged.
        ['?from=yesterday'],
        ['?limit=0'],
        ['?limit=101'],
        ['?limit=many'],
    ])('%s is a 400', async (query) => {
        const response = await get(query);
        expect(response.status).toBe(400);
        expect(mockList).not.toHaveBeenCalled();
    });

    it('passes a well-formed limit, and no limit when the caller names none', async () => {
        await get('?limit=20');
        expect(listOptions().limit).toBe(20);
        mockList.mockClear();
        await get('');
        expect(listOptions()).toEqual(expect.objectContaining({ limit: undefined, from: undefined, to: undefined }));
    });
});
