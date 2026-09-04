import { render, screen } from '@testing-library/react';
import MeetingCardV2 from '../MeetingCardV2';
import { CouncilMeetingWithSubjectPreview } from '@/lib/db/meetings';

// Regression guard for #514, carried over from the retired MeetingCard: a *past*
// meeting card must still show the scheduled time, rendered in the city's
// timezone rather than the visitor's. Before the fix the card fell back to a
// date-only format once the meeting was no longer upcoming or same-day, so the
// time silently disappeared from the archive. V2 also leads with a date stamp,
// which the last case pins to the city's calendar day for the same reason.

let mockLocale = 'el';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => mockLocale,
}));

jest.mock('@/i18n/routing', () => ({
    // `prefetch` is a Link prop, not a DOM attribute; React warns if it reaches an <a>.
    Link: ({ children, prefetch, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
        <a {...props}>{children}</a>
    ),
}));

// The click handler behind TrackedLink reaches posthog-js; the date line is not
// what these assertions are about.
jest.mock('@/lib/analytics/capture', () => ({
    captureEvent: jest.fn(),
}));

// TopicIcon's glyph comes from lucide-react's dynamic icon map, which ships
// untransformed ESM.
jest.mock('@/components/icon', () => ({
    __esModule: true,
    default: () => <span data-testid="icon" />,
}));

// 2024-01-15T14:30:00Z is 16:30 in Athens (EET, UTC+2 in January) and well in the
// past, so the card takes the previously date-only branch.
const PAST_UTC = new Date('2024-01-15T14:30:00Z');

// The same evening, late enough that Athens has already turned the page: 00:30 on
// the 16th there, still 17:30 on the 15th in New York.
const PAST_UTC_LATE = new Date('2024-01-15T22:30:00Z');

const makeMeeting = (
    overrides: Partial<CouncilMeetingWithSubjectPreview> = {},
): CouncilMeetingWithSubjectPreview =>
    ({
        id: 'meeting-1',
        cityId: 'athens',
        name: 'Δημοτικό Συμβούλιο',
        name_en: 'City Council',
        dateTime: PAST_UTC,
        released: true,
        youtubeUrl: null,
        videoUrl: null,
        audioUrl: null,
        muxPlaybackId: null,
        subjects: [],
        administrativeBody: null,
        taskStatuses: [],
        _count: { speakerSegments: 0 },
        ...overrides,
    }) as unknown as CouncilMeetingWithSubjectPreview;

const renderCard = (meeting = makeMeeting(), cityTimezone = 'Europe/Athens') =>
    render(<MeetingCardV2 item={meeting} editable={false} cityTimezone={cityTimezone} />);

describe('MeetingCardV2 date line (#514)', () => {
    beforeEach(() => {
        mockLocale = 'el';
    });

    it('shows the time on a past meeting, in the city timezone', () => {
        renderCard();
        // 14:30Z -> 16:30 Athens, rendered in the pinned 24-hour clock.
        expect(screen.getByText(/15 Ιαν 2024/)).toHaveTextContent(/16:30/);
    });

    it('does not fall back to a date-only render', () => {
        renderCard();
        expect(screen.queryByText(/^15 Ιαν 2024$/)).not.toBeInTheDocument();
    });

    it('renders the city time, not the runner-local time', () => {
        // Guards the timezone argument itself with a zone no CI runner uses:
        // 14:30Z is 09:30 in New York (EST), and the calendar day is unchanged.
        renderCard(makeMeeting(), 'America/New_York');
        expect(screen.getByText(/15 Ιαν 2024/)).toHaveTextContent(/09:30/);
    });

    it('follows the active locale', () => {
        mockLocale = 'en';
        renderCard();
        expect(screen.getByText(/Jan 15, 2024/)).toHaveTextContent(/16:30/);
    });

    it('stamps the city calendar day, not the runner-local one', () => {
        renderCard(makeMeeting({ dateTime: PAST_UTC_LATE }));
        expect(screen.getByText('16')).toBeInTheDocument();
        expect(screen.getByText('ΙΑΝ 24')).toBeInTheDocument();
    });
});
