/** @jest-environment node */
jest.mock('../prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn() }));
jest.mock('../../cache/index', () => ({ createCache: jest.fn() }));
jest.mock('../subject', () => ({ landingSubjectsTag: (realm: string) => 'realm:' + realm + ':landing-subjects' }));
jest.mock('../cityRealm', () => ({ getCityRealm: jest.fn().mockResolvedValue('sweden') }));
jest.mock('../meetingLifecycle', () => ({ setMeetingReleased: jest.fn(), deleteMeetingRecord: jest.fn() }));
jest.mock('../../notifications/meetingNotifications', () => ({ notifySubscribersOnRelease: jest.fn() }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }));
jest.mock('next/server', () => ({ after: jest.fn() }));

import { after } from 'next/server';
import { revalidateTag } from 'next/cache';
import { setMeetingReleased } from '../meetingLifecycle';
import { setMeetingReleaseDirect, toggleMeetingRelease } from '../meetings';
import { withUserAuthorizedToEdit } from '../../auth';
import { notifySubscribersOnRelease } from '../../notifications/meetingNotifications';
import { LifecycleRuleError } from '../../meetingLifecycleRules';

beforeEach(() => jest.clearAllMocks());
it('only schedules subscriber work for a new release', async () => {
    (setMeetingReleased as jest.Mock).mockResolvedValue({ meeting: { released: true }, changed: true });
    await setMeetingReleaseDirect('laholm', 'sep29_2026', true);
    expect(after).toHaveBeenCalledTimes(1);
    await (after as jest.Mock).mock.calls[0][0]();
    expect(notifySubscribersOnRelease).toHaveBeenCalledWith('laholm', 'sep29_2026');
    expect(revalidateTag).toHaveBeenCalledWith('realm:sweden:landing-subjects', 'max');
    expect(withUserAuthorizedToEdit).not.toHaveBeenCalled();
});
it.each([[true, false], [false, true]])('does not notify for released=%s, changed=%s', async (released, changed) => {
    (setMeetingReleased as jest.Mock).mockResolvedValue({ meeting: { released }, changed });
    expect(await setMeetingReleaseDirect('laholm', 'sep29_2026', released)).toMatchObject({ changed });
    expect(after).not.toHaveBeenCalled();
});
it('keeps session authorization on the browser wrapper', async () => {
    (withUserAuthorizedToEdit as jest.Mock).mockRejectedValueOnce(new Error('Forbidden'));
    await expect(toggleMeetingRelease('laholm', 'sep29_2026', true)).rejects.toThrow('Forbidden');
    expect(setMeetingReleased).not.toHaveBeenCalled();
});
it('preserves postponement lifecycle errors and schedules no notification', async () => {
    (setMeetingReleased as jest.Mock).mockRejectedValueOnce(new LifecycleRuleError('laterMeetingReleased', 'Later meeting is public'));
    await expect(setMeetingReleaseDirect('laholm', 'sep29_2026', true)).rejects.toMatchObject({ code: 'laterMeetingReleased' });
    expect(after).not.toHaveBeenCalled();
});
