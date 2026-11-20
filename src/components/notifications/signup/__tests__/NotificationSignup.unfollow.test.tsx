import { act, fireEvent, render, screen } from '@testing-library/react';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { NotificationSignup } from '../NotificationSignup';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('@/lib/actions/notifications', () => ({ saveNotificationPreferences: jest.fn() }));
jest.mock('@/lib/actions/notis', () => ({ getNotisChannelState: jest.fn().mockResolvedValue(null), setNotisEnabled: jest.fn() }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
jest.mock('../useNearbySubjects', () => ({ useNearbySubjects: () => null }));
jest.mock('../IntroStep', () => ({ IntroStep: () => null, IntroAside: () => null }));
jest.mock('../ChannelsStep', () => ({ ChannelsStep: () => null }));
jest.mock('../SignupSummary', () => ({ SignupSummary: () => null }));
jest.mock('../CompleteScreen', () => ({
    CompleteScreen: () => null,
    CompleteAside: () => null,
    UnfollowedScreen: () => <p>unfollowed screen</p>,
}));
// The step itself is BodyFollowChoices and copy; this test is about the action under it.
jest.mock('../PreferencesStep', () => ({
    PreferencesAside: () => null,
    PreferencesStep: ({ onBodiesChange, willUnfollow }: { onBodiesChange: (bodies: PublicAdministrativeBody[]) => void; willUnfollow: boolean }) => (
        <div>
            <button type="button" onClick={() => onBodiesChange([])}>untick every body</button>
            {willUnfollow && <p>unfollow note</p>}
        </div>
    ),
}));

const youth: PublicAdministrativeBody = { id: 'ab_youth', name: 'ΔΣΝ', name_en: 'Youth', type: 'youthCouncil', tier: 'secondary', cityId: 'chania', youtubeChannelUrl: null, place: null };
const city = { id: 'chania', name: 'Χανιά', supportsNotifications: false } as CityWithGeometry;
const account = { name: 'Μαρία', email: 'maria@example.com', phone: null, notifyByPhone: false };

/** Renders the signup, and lets the Notis status request settle. */
async function signup(existing: { locations?: { text: string; coordinates: [number, number] }[] } = {}) {
    await act(async () => {
        render(
        <NotificationSignup
            city={city}
            scope="bodies"
            topics={[]}
            secondaryBodies={[youth]}
            initialStep={2}
            pickerQuery=""
            existing={{ id: 'pref-1', locations: existing.locations ?? [], topics: [], bodies: [youth], notifyByEmail: false }}
            account={account}
            googleAvailable={false}
        />,
        );
    });
}

/**
 * A reader who unticks their last body in a signup for bodies alone (#829):
 * the action deletes the row through the delete of the profile, and only when
 * the row holds nothing but the follows.
 */
describe('NotificationSignup, unticking the last body', () => {
    const fetchMock = jest.fn();
    beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock;
    });

    it('deletes a row that holds only the follows, and then says so', async () => {
        fetchMock.mockResolvedValue({ ok: true });
        await signup();

        fireEvent.click(screen.getByText('untick every body'));
        expect(screen.getByText('unfollow note')).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'bodiesScope.unfollow' }));
        });

        expect(fetchMock).toHaveBeenCalledWith('/api/user/notification-preferences/pref-1', { method: 'DELETE' });
        expect(screen.getByText('unfollowed screen')).toBeTruthy();
    });

    it('keeps a row with places: unticking every body goes on to the channels', async () => {
        await signup({ locations: [{ text: 'Κυψέλη', coordinates: [23.73, 37.99] }] });

        fireEvent.click(screen.getByText('untick every body'));

        expect(screen.queryByText('unfollow note')).toBeNull();
        expect(screen.queryByRole('button', { name: 'bodiesScope.unfollow' })).toBeNull();
        expect(screen.getByRole('button', { name: 'ctaContinue' })).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stays on the step and says what failed when the delete fails', async () => {
        fetchMock.mockResolvedValue({ ok: false });
        await signup();

        fireEvent.click(screen.getByText('untick every body'));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'bodiesScope.unfollow' }));
        });

        expect(screen.queryByText('unfollowed screen')).toBeNull();
        expect(screen.getByText('bodiesScope.unfollowFailedButton')).toBeTruthy();
    });
});
