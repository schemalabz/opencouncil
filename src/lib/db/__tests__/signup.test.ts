/** @jest-environment node */
const mockPreferenceFindUnique = jest.fn();
const mockPreferenceFindFirst = jest.fn();
const mockUserFindUnique = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    prisma: {
        notificationPreference: {
            findUnique: (...args: unknown[]) => mockPreferenceFindUnique(...args),
            findFirst: (...args: unknown[]) => mockPreferenceFindFirst(...args),
        },
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    },
}));
jest.mock('@/lib/db/notifications', () => ({ getLocationCoordinates: jest.fn(), withCoordinates: jest.fn() }));

import { getCityChannelRequest, hasNotificationPreference } from '../signup';

beforeEach(() => {
    mockPreferenceFindUnique.mockReset();
    mockPreferenceFindFirst.mockReset();
    mockUserFindUnique.mockReset();
    mockUserFindUnique.mockResolvedValue({ notifyByPhone: false });
});

describe('getCityChannelRequest', () => {
    it('is null without a preference for the municipality', async () => {
        mockPreferenceFindUnique.mockResolvedValue(null);
        mockUserFindUnique.mockResolvedValue({ notifyByPhone: true });
        expect(await getCityChannelRequest('user-1', 'chania')).toBeNull();
    });

    /**
     * An unsubscribe keeps the row and turns its email channel off, so the
     * row's existence is not the answer — a reader who left would otherwise
     * count as a member for ever.
     */
    it('reports the channels the reader asked for, on and off alike', async () => {
        mockPreferenceFindUnique.mockResolvedValue({ notifyByEmail: true });
        expect(await getCityChannelRequest('user-1', 'chania')).toEqual({ notifyByEmail: true, notifyByPhone: false });

        mockPreferenceFindUnique.mockResolvedValue({ notifyByEmail: false });
        mockUserFindUnique.mockResolvedValue({ notifyByPhone: true });
        expect(await getCityChannelRequest('user-1', 'chania')).toEqual({ notifyByEmail: false, notifyByPhone: true });
    });

    it('reads the phone request as off when the account is gone', async () => {
        mockPreferenceFindUnique.mockResolvedValue({ notifyByEmail: false });
        mockUserFindUnique.mockResolvedValue(null);
        expect(await getCityChannelRequest('user-1', 'chania')).toEqual({ notifyByEmail: false, notifyByPhone: false });
    });
});

describe('hasNotificationPreference', () => {
    it('is true when the reader has a preference in any municipality', async () => {
        mockPreferenceFindFirst.mockResolvedValue({ id: 'preference-1' });
        expect(await hasNotificationPreference('user-1')).toBe(true);
        expect(mockPreferenceFindFirst).toHaveBeenCalledWith({ where: { userId: 'user-1' }, select: { id: true } });
    });

    it('is false for a reader who never asked', async () => {
        mockPreferenceFindFirst.mockResolvedValue(null);
        expect(await hasNotificationPreference('user-1')).toBe(false);
    });
});
