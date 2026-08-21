/** @jest-environment node */

const mockFindMany = jest.fn();

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        highlight: {
            findMany: (...args: unknown[]) => mockFindMany(...args),
        },
    },
}));

const mockGetCurrentUser = jest.fn();

jest.mock('../../auth', () => ({
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    isUserAuthorizedToEdit: jest.fn(),
    withUserAuthorizedToEdit: jest.fn(),
}));

import { getMyHighlights } from '../highlights';

beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockFindMany.mockResolvedValue([]);
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
            where: { createdById: 'user-1' },
        }));
    });

    // The meetingId tiebreaker keeps the highlights of two meetings that share
    // a dateTime apart, so the page groups each meeting exactly once.
    it('orders by meeting date, then meeting id, then updatedAt', async () => {
        await getMyHighlights();

        expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: [
                { meeting: { dateTime: 'desc' } },
                { meetingId: 'desc' },
                { updatedAt: 'desc' },
            ],
        }));
    });
});
