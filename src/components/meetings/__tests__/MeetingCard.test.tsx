import { render, screen } from '@testing-library/react';
import MeetingCard from '../MeetingCard';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';

// Regression guard for #514: a *past* meeting card must still show the scheduled
// time, rendered in the city's timezone rather than the visitor's. Before the fix
// the card fell back to a date-only format once the meeting was no longer
// upcoming or same-day, so the time silently disappeared from the archive.

let mockLocale = 'el';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => mockLocale,
}));

jest.mock('@/i18n/routing', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/athens',
    Link: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// subject-badge pulls in lucide-react's dynamic icon map, which ships untransformed
// ESM; the subjects list isn't what these assertions are about.
jest.mock('../../subject-badge', () => ({
    __esModule: true,
    default: () => <span data-testid="subject-badge" />,
}));

// Drop the motion-only props rather than spreading them onto a real <div>, which
// React warns about as unknown event handlers.
jest.mock('framer-motion', () => ({
    motion: {
        div: ({
            children,
            whileHover,
            initial,
            animate,
            transition,
            onHoverStart,
            onHoverEnd,
            ...props
        }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    },
}));

// 2024-01-15T14:30:00Z is 16:30 in Athens (EET, UTC+2 in January) and well in the
// past, so the card takes the previously date-only branch.
const PAST_UTC = new Date('2024-01-15T14:30:00Z');

const makeMeeting = (
    overrides: Partial<CouncilMeetingWithAdminBodyAndSubjects> = {},
): CouncilMeetingWithAdminBodyAndSubjects =>
    ({
        id: 'meeting-1',
        cityId: 'athens',
        name: 'Δημοτικό Συμβούλιο',
        name_en: 'City Council',
        dateTime: PAST_UTC,
        released: true,
        videoUrl: null,
        subjects: [],
        administrativeBody: null,
        ...overrides,
    }) as unknown as CouncilMeetingWithAdminBodyAndSubjects;

const renderCard = (meeting = makeMeeting()) =>
    render(<MeetingCard item={meeting} editable={false} cityTimezone="Europe/Athens" />);

describe('MeetingCard date line (#514)', () => {
    beforeEach(() => {
        mockLocale = 'el';
    });

    it('shows the time on a past meeting, in the city timezone', () => {
        renderCard();
        // 14:30Z -> 16:30 Athens. Greek formatting renders this as "4:30 μ.μ.".
        expect(screen.getByText(/15 Ιανουαρίου 2024/)).toHaveTextContent(/4:30/);
    });

    it('does not fall back to a date-only render', () => {
        renderCard();
        expect(screen.queryByText(/^15 Ιανουαρίου 2024$/)).not.toBeInTheDocument();
    });

    it('renders the city time, not the runner-local time', () => {
        // Guards the timezone argument itself with a zone no CI runner uses:
        // 14:30Z is 09:30 in New York (EST), and the calendar day is unchanged.
        render(
            <MeetingCard item={makeMeeting()} editable={false} cityTimezone="America/New_York" />,
        );
        expect(screen.getByText(/15 Ιανουαρίου 2024/)).toHaveTextContent(/9:30/);
    });

    it('follows the active locale', () => {
        mockLocale = 'en';
        renderCard();
        expect(screen.getByText(/January 15, 2024/)).toHaveTextContent(/4:30/);
    });
});
