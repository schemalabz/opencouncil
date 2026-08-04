/** @jest-environment node */

const mockMeetingFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: {
            findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args),
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
        mockMeetingFindUnique.mockResolvedValue({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', null)).resolves.toEqual({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', SERVICE)).resolves.toEqual({ released: true });
    });

    it('hides unreleased meetings from anonymous and unrelated users', async () => {
        mockMeetingFindUnique.mockResolvedValue({ released: false });
        await expect(requireVisibleMeeting('athens', 'm1', null)).rejects.toThrow(NotFoundError);
        await expect(requireVisibleMeeting('athens', 'm1', USER)).rejects.toThrow(NotFoundError);
    });

    it('shows unreleased meetings to service identities and city editors', async () => {
        mockMeetingFindUnique.mockResolvedValue({ released: false });
        await expect(requireVisibleMeeting('athens', 'm1', SERVICE)).resolves.toEqual({ released: false });

        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: 'athens' }] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual({ released: false });

        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: true, administers: [] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual({ released: false });
    });

    it('hides unreleased meetings from editors of other cities', async () => {
        mockMeetingFindUnique.mockResolvedValue({ released: false });
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: 'argos' }] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).rejects.toThrow(NotFoundError);
    });

    it('404s missing meetings for everyone', async () => {
        mockMeetingFindUnique.mockResolvedValue(null);
        await expect(requireVisibleMeeting('athens', 'nope', SERVICE)).rejects.toThrow(NotFoundError);
        await expect(requireVisibleMeeting('athens', 'nope', null)).rejects.toThrow(NotFoundError);
    });
});
