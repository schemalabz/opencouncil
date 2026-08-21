/** @jest-environment node */

const mockFindMany = jest.fn();
const mockQueryRaw = jest.fn();

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        highlight: {
            findMany: (...args: unknown[]) => mockFindMany(...args),
        },
        $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    },
}));

const mockGetCurrentUser = jest.fn();

jest.mock('../../auth', () => ({
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    isUserAuthorizedToEdit: jest.fn(),
    withUserAuthorizedToEdit: jest.fn(),
}));

import { getMyHighlights } from '../highlights';
import { MY_HIGHLIGHTS_LIMIT } from '../highlights-core';

const highlight = (id: string) => ({
    id,
    cityId: 'athens',
    meetingId: 'meeting-1',
    name: id,
    videoUrl: null,
    isShowcased: false,
    updatedAt: new Date('2026-01-01'),
    meeting: { id: 'meeting-1', cityId: 'athens', released: true },
    subject: null,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', isSuperAdmin: false, administers: [] });
    mockFindMany.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([]);
});

describe('getMyHighlights', () => {
    it('requires a signed-in user before touching the database', async () => {
        mockGetCurrentUser.mockResolvedValue(null);

        await expect(getMyHighlights()).rejects.toThrow();
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('filters by the session user id, never by a caller-supplied id', async () => {
        await getMyHighlights();

        expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ createdById: 'user-1' }),
        }));
    });

    it('orders by meeting date, then updatedAt', async () => {
        await getMyHighlights();

        expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: [
                { meeting: { dateTime: 'desc' } },
                { updatedAt: 'desc' },
            ],
        }));
    });

    it('hides highlights on unreleased meetings from a user who administers no city', async () => {
        await getMyHighlights();

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.OR).toEqual([{ meeting: { released: true } }]);
    });

    it('keeps unreleased meetings of the cities the user administers', async () => {
        mockGetCurrentUser.mockResolvedValue({
            id: 'user-1',
            isSuperAdmin: false,
            // A party administrator carries a null cityId; it must not reach the filter.
            administers: [{ cityId: 'athens' }, { cityId: null }],
        });

        await getMyHighlights();

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.OR).toEqual([
            { meeting: { released: true } },
            { cityId: { in: ['athens'] } },
        ]);
    });

    it('applies no meeting filter for a superadmin', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', isSuperAdmin: true, administers: [] });

        await getMyHighlights();

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where).toEqual({ createdById: 'user-1' });
    });

    it('reports a truncated page and returns no more than the limit', async () => {
        mockFindMany.mockResolvedValue(
            Array.from({ length: MY_HIGHLIGHTS_LIMIT + 1 }, (_, i) => highlight(`h-${i}`))
        );

        const { highlights, truncated } = await getMyHighlights();

        expect(truncated).toBe(true);
        expect(highlights).toHaveLength(MY_HIGHLIGHTS_LIMIT);
    });

    it('reports a full page as complete', async () => {
        mockFindMany.mockResolvedValue([highlight('h-1')]);

        const { truncated } = await getMyHighlights();

        expect(truncated).toBe(false);
    });

    it('attaches the aggregated statistics, and zeroes for a highlight with none', async () => {
        mockFindMany.mockResolvedValue([highlight('h-1'), highlight('h-2')]);
        mockQueryRaw.mockResolvedValue([
            { highlightId: 'h-1', duration: 12.5, utteranceCount: 3, speakerCount: 2 },
        ]);

        const { highlights } = await getMyHighlights();

        expect(highlights[0].statistics).toEqual({ duration: 12.5, utteranceCount: 3, speakerCount: 2 });
        expect(highlights[1].statistics).toEqual({ duration: 0, utteranceCount: 0, speakerCount: 0 });
    });

    it('runs no aggregate when the user has no highlights', async () => {
        await getMyHighlights();

        expect(mockQueryRaw).not.toHaveBeenCalled();
    });
});
