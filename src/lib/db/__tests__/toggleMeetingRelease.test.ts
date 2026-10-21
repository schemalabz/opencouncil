/** @jest-environment node */
const mockSetReleased = jest.fn();
const mockNotify = jest.fn();
const mockAfter = jest.fn((run: () => unknown) => run());
jest.mock('server-only', () => ({}));
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn() }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn(), unstable_cache: (f: unknown) => f }));
jest.mock('next/server', () => ({ after: (run: () => unknown) => mockAfter(run) }));
jest.mock('@/lib/db/meetingLifecycle', () => ({ setMeetingReleased: (...a: unknown[]) => mockSetReleased(...a), deleteMeetingRecord: jest.fn() }));
jest.mock('@/lib/notifications/meetingNotifications', () => ({ notifySubscribersOnRelease: (...a: unknown[]) => mockNotify(...a) }));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: async () => 'greece' }));
jest.mock('@/lib/db/subject', () => ({ landingSubjectsTag: () => 'landing' }));
jest.mock('@/lib/cache/index', () => ({ createCache: (f: unknown) => f }));

import { toggleMeetingRelease } from '@/lib/db/meetings';

describe('toggleMeetingRelease', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['a draft becomes public', true, true, 1],
        ['a repeated release changes nothing', true, false, 0],
        ['a meeting is hidden', false, true, 0],
    ])('when %s, it schedules the release notifications %i time(s)', async (_case, released, changed, calls) => {
        mockSetReleased.mockResolvedValue({ meeting: { cityId: 'athens', id: 'm', released }, changed });

        await toggleMeetingRelease('athens', 'm', released);

        expect(mockNotify).toHaveBeenCalledTimes(calls);
        if (calls) expect(mockNotify).toHaveBeenCalledWith('athens', 'm');
    });
});
