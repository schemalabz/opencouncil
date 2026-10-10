/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ withServiceOrUserAuth: jest.fn() }));
jest.mock('@/lib/db/meetingsList', () => ({ getCouncilMeetingsForCity: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/meetingWrites', () => ({ createMeetingWithEffects: jest.fn() }));
// The public list reads the original date of a postponed meeting.
jest.mock('@/lib/db/meetingLifecycle', () => ({ originalScheduledDates: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('@/lib/db/citiesAdmin', () => ({ getCityNameEnAndTimezone: jest.fn().mockResolvedValue({ name_en: 'Athens', timezone: 'Europe/Athens' }) }));

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
