import { render } from '@testing-library/react';
import { MeetingStageStrip } from '../MeetingStageStrip';

const mockMeetingData = jest.fn();
const mockPreference = jest.fn();

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('@/i18n/routing', () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
jest.mock('@/components/meetings/options/OptionsContext', () => ({ useTranscriptOptions: () => ({ options: { editsAllowed: false } }) }));
jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({ useCouncilMeetingData: () => mockMeetingData() }));
jest.mock('@/contexts/NotificationPreferenceContext', () => ({ useNotificationPreference: () => mockPreference() }));

const YOUTH = { id: 'youth', name: 'Δημοτικό Συμβούλιο Νέων', type: 'youthCouncil', tier: 'secondary', youtubeChannelUrl: null };
const COUNCIL = { id: 'council', name: 'Δημοτικό Συμβούλιο', type: 'council', tier: 'primary', youtubeChannelUrl: null };

/** What the strip of a waiting meeting shows about updates: the promise of one, or the link to the signup. */
function strip({ body, supportsNotifications, preference, notificationsDisabled = false }: {
    body: typeof YOUTH | typeof COUNCIL;
    supportsNotifications: boolean;
    preference: { bodies: { id: string }[] } | null;
    notificationsDisabled?: boolean;
}) {
    mockMeetingData.mockReturnValue({
        meeting: {
            id: 'm1', cityId: 'chania', dateTime: new Date('2026-11-20T16:00:00Z'), administrativeBody: body,
            youtubeUrl: null, agendaUrl: null, format: null, noRecording: false,
        },
        city: { id: 'chania', timezone: 'Europe/Athens', realm: 'greece', supportsNotifications },
        subjects: [],
        transcriptHiddenForReview: false,
        notificationsDisabled,
    });
    mockPreference.mockReturnValue(preference);
    const { container, unmount } = render(<MeetingStageStrip presentation={{ type: 'stage', stage: 'waiting' }} stage="waiting" deadline={null} />);
    const shown = {
        promised: container.textContent!.includes('notificationComing'),
        signupLink: container.querySelector('a[href="/chania/notifications"]') !== null,
    };
    unmount();
    return shown;
}

/**
 * The strip promises an update only to a reader the meeting reaches
 * (preferenceCoversBody, #829), and offers the signup, where the tick is, to
 * everyone else the body sends to.
 */
describe('MeetingStageStrip and the update it promises', () => {
    const subscriber = { bodies: [] };
    const follower = { bodies: [{ id: 'youth' }] };

    it('promises a youth meeting to its follower, and sends a subscriber who does not follow it to the signup', () => {
        expect(strip({ body: YOUTH, supportsNotifications: true, preference: follower })).toEqual({ promised: true, signupLink: false });
        expect(strip({ body: YOUTH, supportsNotifications: true, preference: subscriber })).toEqual({ promised: false, signupLink: true });
    });

    it('promises a council meeting to every reader of a city that supports notifications, a follower included', () => {
        expect(strip({ body: COUNCIL, supportsNotifications: true, preference: subscriber })).toEqual({ promised: true, signupLink: false });
        expect(strip({ body: COUNCIL, supportsNotifications: true, preference: follower })).toEqual({ promised: true, signupLink: false });
        expect(strip({ body: COUNCIL, supportsNotifications: true, preference: null })).toEqual({ promised: false, signupLink: true });
    });

    it('in a city without notifications, offers the youth council and nothing of the council', () => {
        expect(strip({ body: YOUTH, supportsNotifications: false, preference: follower })).toEqual({ promised: true, signupLink: false });
        expect(strip({ body: YOUTH, supportsNotifications: false, preference: null })).toEqual({ promised: false, signupLink: true });
        expect(strip({ body: COUNCIL, supportsNotifications: false, preference: follower })).toEqual({ promised: false, signupLink: false });
    });

    it('offers and promises nothing for a body whose notifications are off, to a follower or anyone else', () => {
        for (const body of [YOUTH, COUNCIL]) {
            for (const preference of [follower, subscriber, null]) {
                expect({ body: body.id, shown: strip({ body, supportsNotifications: true, preference, notificationsDisabled: true }) })
                    .toEqual({ body: body.id, shown: { promised: false, signupLink: false } });
            }
        }
    });
});
