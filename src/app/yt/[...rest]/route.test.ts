/** @jest-environment node */

jest.mock('server-only', () => ({}));
jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_URL: 'https://opencouncil.gr' },
}));
jest.mock('@/lib/db/meetings', () => ({
    findCouncilMeetingByYouTubeVideoId: jest.fn(),
}));
jest.mock('@/lib/db/cityRealm', () => ({
    getCityRealm: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { findCouncilMeetingByYouTubeVideoId } from '@/lib/db/meetings';
import { getCityRealm } from '@/lib/db/cityRealm';
import { GET } from './route';

const mockFindMeeting = jest.mocked(findCouncilMeetingByYouTubeVideoId);
const mockGetCityRealm = jest.mocked(getCityRealm);
const request = () => new NextRequest(
    'https://opencouncil.gr/yt/https://www.youtube.com/watch?v=dQw4w9WgXc&t=90',
);

beforeEach(() => {
    jest.resetAllMocks();
    mockFindMeeting.mockResolvedValue({ cityId: 'test-city', id: 'meeting-1' });
});

it('redirects to the meeting realm and preserves the timestamp', async () => {
    mockGetCityRealm.mockResolvedValue('france');

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
        'https://opencouncil.fr/test-city/meeting-1/transcript?t=90',
    );
    expect(mockGetCityRealm).toHaveBeenCalledWith('test-city');
});

it('redirects within the same realm', async () => {
    mockGetCityRealm.mockResolvedValue('greece');

    const response = await GET(request());

    expect(response.headers.get('location')).toBe(
        'https://opencouncil.gr/test-city/meeting-1/transcript?t=90',
    );
});

it('returns 404 when no meeting matches the video', async () => {
    mockFindMeeting.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mockGetCityRealm).not.toHaveBeenCalled();
});
