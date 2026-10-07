/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'https://opencouncil.gr' } }));
jest.mock('@/lib/db/meetings', () => ({ findCouncilMeetingByYouTubeVideoId: jest.fn() }));

import { NextRequest } from 'next/server';
import { findCouncilMeetingByYouTubeVideoId } from '@/lib/db/meetings';
import { GET } from './route';

const mockFindMeeting = jest.mocked(findCouncilMeetingByYouTubeVideoId);
const ID = 'dQw4w9WgXcQ';

/**
 * Calls the handler the way Next does: the catch-all segments as params, and
 * the query string on the request. `path` is what follows `/yt/` after the
 * router collapsed `//` in it.
 */
function get(path: string) {
    const [pathname, search = ''] = path.split('?');
    const request = new NextRequest(`https://opencouncil.gr/yt/${pathname}${search ? `?${search}` : ''}`);
    return GET(request, { params: Promise.resolve({ rest: pathname.split('/').map(decodeURIComponent) }) });
}

beforeEach(() => {
    mockFindMeeting.mockReset();
    mockFindMeeting.mockResolvedValue({ cityId: 'test-city', id: 'meeting-1', youtubeUrl: `https://youtu.be/${ID}`, city: { realm: 'greece' } });
});

it('redirects a collapsed watch link to the transcript at the same second', async () => {
    const response = await get(`https:/www.youtube.com/watch?v=${ID}&t=90`);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://opencouncil.gr/test-city/meeting-1/transcript?t=90');
    expect(mockFindMeeting).toHaveBeenCalledWith(ID);
});

it('reads the 1h2m3s timestamp notation', async () => {
    const response = await get(`https:/youtu.be/${ID}?si=abc&t=1h2m3s`);

    expect(response.headers.get('location')).toBe('https://opencouncil.gr/test-city/meeting-1/transcript?t=3723');
});

it('redirects to the realm of the meeting city, without a timestamp when the link has none', async () => {
    mockFindMeeting.mockResolvedValue({ cityId: 'paris', id: 'meeting-1', youtubeUrl: `https://youtu.be/${ID}`, city: { realm: 'france' } });

    const response = await get(`youtu.be/${ID}`);

    expect(response.headers.get('location')).toBe('https://opencouncil.fr/paris/meeting-1/transcript');
});

it('answers 404 for a link that is not a YouTube video', async () => {
    await expect(get('https:/vimeo.com/12345')).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    expect(mockFindMeeting).not.toHaveBeenCalled();
});

it('sends a video that no released meeting has on to YouTube, at the same second', async () => {
    mockFindMeeting.mockResolvedValue(null);

    const response = await get(`https:/youtu.be/${ID}?t=90`);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`https://www.youtube.com/watch?v=${ID}&t=90`);
});
