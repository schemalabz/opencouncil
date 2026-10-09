import { act, render, screen } from '@testing-library/react';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { draftKey, writeDraft } from '@/components/signup/signup-draft';
import { NotificationSignup } from '../NotificationSignup';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('@/lib/actions/notifications', () => ({ saveNotificationPreferences: jest.fn() }));
jest.mock('@/lib/actions/notis', () => ({ getNotisChannelState: jest.fn().mockResolvedValue(null), setNotisEnabled: jest.fn() }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
jest.mock('../useNearbySubjects', () => ({ useNearbySubjects: () => null }));
jest.mock('../IntroStep', () => ({ IntroStep: () => null, IntroAside: () => null }));
jest.mock('../ChannelsStep', () => ({ ChannelsStep: () => null }));
jest.mock('../SignupSummary', () => ({ SignupSummary: () => null }));
jest.mock('../CompleteScreen', () => ({ CompleteScreen: () => null, CompleteAside: () => null, UnfollowedScreen: () => null }));
// The step itself is BodyFollowChoices and copy; this test is about which bodies start ticked.
jest.mock('../PreferencesStep', () => ({
    PreferencesAside: () => null,
    PreferencesStep: ({ selectedBodies }: { selectedBodies: PublicAdministrativeBody[] }) => (
        <p>ticked: {selectedBodies.map(body => body.id).join(',')}</p>
    ),
}));

const youth: PublicAdministrativeBody = { id: 'ab_youth', name: 'ΔΣΝ', name_en: 'Youth', type: 'youthCouncil', tier: 'secondary', cityId: 'chania', youtubeChannelUrl: null, place: null };
const city = { id: 'chania', name: 'Χανιά', supportsNotifications: true } as CityWithGeometry;

async function signup(requestedBody?: PublicAdministrativeBody) {
    await act(async () => {
        render(
            <NotificationSignup
                city={city}
                scope="city"
                topics={[]}
                secondaryBodies={[youth]}
                requestedBody={requestedBody}
                initialStep={2}
                pickerQuery=""
                existing={null}
                account={null}
                googleAvailable={false}
            />,
        );
    });
}

/**
 * The follow link of a body page (#829) lands on the city signup with
 * `?body=`. The body must start ticked, or a reader who misses its card
 * subscribes to the municipality and not to the body.
 */
describe('NotificationSignup, a city signup from a body page', () => {
    beforeEach(() => localStorage.clear());

    it('starts with the requested body ticked', async () => {
        await signup(youth);
        expect(screen.getByText('ticked: ab_youth')).toBeTruthy();
    });

    it('keeps the requested body ticked over a kept draft that ticked none', async () => {
        writeDraft(draftKey('notifications', city.id), { bodies: [], topics: [], locations: [] });
        await signup(youth);
        expect(screen.getByText('ticked: ab_youth')).toBeTruthy();
    });

    it('ticks nothing without a requested body', async () => {
        await signup();
        expect(screen.getByText('ticked:')).toBeTruthy();
    });
});
