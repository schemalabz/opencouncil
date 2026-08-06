/** @jest-environment node */

const mockMeetingFindFirst = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: {
            findFirst: (...args: unknown[]) => mockMeetingFindFirst(...args),
        },
        user: {
            findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
        },
    },
}));

import { requireVisibleMeeting } from '../gate';
import { NotFoundError } from '../../api/errors';

const USER = { type: 'user', userId: 'u1' } as const;
const SERVICE = { type: 'service', keyName: 'bot' } as const;

describe('requireVisibleMeeting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    });

    it('passes released meetings for everyone', async () => {
        mockMeetingFindFirst.mockResolvedValue({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', null)).resolves.toEqual({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', SERVICE)).resolves.toEqual({ released: true });
    });

    it('hides unreleased meetings from anonymous and unrelated users', async () => {
        mockMeetingFindFirst.mockResolvedValue({ released: false });
        await expect(requireVisibleMeeting('athens', 'm1', null)).rejects.toThrow(NotFoundError);
        await expect(requireVisibleMeeting('athens', 'm1', USER)).rejects.toThrow(NotFoundError);
    });

    it('shows unreleased meetings to service identities and city editors', async () => {
        mockMeetingFindFirst.mockResolvedValue({ released: false });
        await expect(requireVisibleMeeting('athens', 'm1', SERVICE)).resolves.toEqual({ released: false });

        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: 'athens' }] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual({ released: false });

        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: true, administers: [] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual({ released: false });
    });

    it('hides unreleased meetings from editors of other cities', async () => {
        mockMeetingFindFirst.mockResolvedValue({ released: false });
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: 'argos' }] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).rejects.toThrow(NotFoundError);
    });

    it('404s missing meetings for everyone', async () => {
        mockMeetingFindFirst.mockResolvedValue(null);
        await expect(requireVisibleMeeting('athens', 'nope', SERVICE)).rejects.toThrow(NotFoundError);
        await expect(requireVisibleMeeting('athens', 'nope', null)).rejects.toThrow(NotFoundError);
    });
});

describe('realm scoping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    });

    it('scopes the meeting lookup to the request realm', async () => {
        mockMeetingFindFirst.mockResolvedValue({ released: true });
        await requireVisibleMeeting('athens', 'm1', null);

        // Default realm outside a request scope is greece; the point is that a
        // realm predicate is always present, so one realm can't read another's.
        const where = mockMeetingFindFirst.mock.calls[0][0].where;
        expect(where).toMatchObject({ cityId: 'athens', id: 'm1', city: { realm: 'greece' } });
    });
});
