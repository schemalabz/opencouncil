/** @jest-environment node */
const mockFindMany = jest.fn();
jest.mock('server-only', () => ({}));
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { councilMeeting: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
}));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn() }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn(), unstable_cache: (f: unknown) => f }));
jest.mock('@/lib/db/subject', () => ({ landingSubjectsTag: () => 'landing' }));
jest.mock('@/lib/cache/index', () => ({ createCache: (f: unknown) => f }));

import { findCouncilMeetingByYouTubeVideoId } from '@/lib/db/meetings';

const ID = 'dQw4w9WgXcQ';
const row = (id: string, youtubeUrl: string | null) => ({ cityId: 'athens', id, youtubeUrl, city: { realm: 'greece' } });

beforeEach(() => mockFindMany.mockReset());

describe('findCouncilMeetingByYouTubeVideoId', () => {
    it('searches released meetings only, newest first', async () => {
        mockFindMany.mockResolvedValue([]);

        await findCouncilMeetingByYouTubeVideoId(ID);

        expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { released: true, youtubeUrl: { contains: ID } },
            orderBy: [{ dateTime: 'desc' }, { createdAt: 'desc' }],
        }));
    });

    it('returns the first candidate whose stored URL is the video', async () => {
        mockFindMany.mockResolvedValue([row('newest', `https://youtu.be/${ID}`), row('older', `https://youtu.be/${ID}`)]);

        await expect(findCouncilMeetingByYouTubeVideoId(ID)).resolves.toMatchObject({ id: 'newest', city: { realm: 'greece' } });
    });

    it('skips a candidate that only carries the id inside another parameter', async () => {
        mockFindMany.mockResolvedValue([
            row('playlist', `https://www.youtube.com/watch?v=OTHERvideo1&list=PLxxv=${ID}`),
            row('video', ` https://www.youtube.com/watch?v=${ID}&t=90 `),
        ]);

        await expect(findCouncilMeetingByYouTubeVideoId(ID)).resolves.toMatchObject({ id: 'video' });
    });

    it('returns null when no candidate is the video', async () => {
        mockFindMany.mockResolvedValue([row('prefix', `https://youtu.be/${ID}extra`), row('none', null)]);

        await expect(findCouncilMeetingByYouTubeVideoId(ID)).resolves.toBeNull();
    });
});
