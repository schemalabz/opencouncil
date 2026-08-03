/** @jest-environment node */

const mockMeetingFindUnique = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: {
            findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args),
        },
    },
}));

import { requireVisibleMeeting } from '../gate';
import { NotFoundError } from '../../api/errors';

const USER = { type: 'user', userId: 'u1' } as const;
const SERVICE = { type: 'service', keyName: 'bot' } as const;

describe('requireVisibleMeeting', () => {
    beforeEach(() => jest.clearAllMocks());

    it('passes released meetings for everyone', async () => {
        mockMeetingFindUnique.mockResolvedValue({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', null)).resolves.toEqual({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual({ released: true });
        await expect(requireVisibleMeeting('athens', 'm1', SERVICE)).resolves.toEqual({ released: true });
    });

    it('hides unreleased meetings from anonymous and user identities', async () => {
        mockMeetingFindUnique.mockResolvedValue({ released: false });
        await expect(requireVisibleMeeting('athens', 'm1', null)).rejects.toThrow(NotFoundError);
        await expect(requireVisibleMeeting('athens', 'm1', USER)).rejects.toThrow(NotFoundError);
    });

    it('shows unreleased meetings to service identities', async () => {
        mockMeetingFindUnique.mockResolvedValue({ released: false });
        await expect(requireVisibleMeeting('athens', 'm1', SERVICE)).resolves.toEqual({ released: false });
    });

    it('404s missing meetings for everyone', async () => {
        mockMeetingFindUnique.mockResolvedValue(null);
        await expect(requireVisibleMeeting('athens', 'nope', SERVICE)).rejects.toThrow(NotFoundError);
        await expect(requireVisibleMeeting('athens', 'nope', null)).rejects.toThrow(NotFoundError);
    });
});
