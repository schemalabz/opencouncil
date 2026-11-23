import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CityWithCounts } from '@/lib/db/cities';
import type { CityNotificationPreference } from '@/lib/db/notifications';
import { CityNotificationCard } from '../CityNotificationCard';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock('@/components/ui/cta-button', () => ({
    CtaButton: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock('../RailDisclosure', () => ({
    RailDisclosure: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/TopicPill', () => ({ TopicPill: () => null }));
jest.mock('@/components/signup/NotisInviteCard', () => ({
    NotisInviteCard: () => <p>notis invite</p>,
}));

const youth = { id: 'ab_youth', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil' as const, tier: 'secondary' as const, cityId: 'preveza', youtubeChannelUrl: null, place: null };
const other = { ...youth, id: 'ab_other', name: 'Άλλο όργανο', name_en: 'Other body' };

function city(supportsNotifications: boolean) {
    return { id: 'preveza', authorityType: 'municipality', supportsNotifications } as unknown as CityWithCounts;
}
function preference(bodyIds: string[]) {
    return { interests: [], locations: [], bodies: bodyIds.map(id => ({ id })) } as unknown as CityNotificationPreference;
}
function renderCard(supportsNotifications: boolean, followableBodies: typeof youth[], pref: CityNotificationPreference | null = null) {
    return render(
        <CityNotificationCard
            city={city(supportsNotifications)}
            preference={pref}
            phoneChannel={Promise.resolve(null)}
            followableBodies={followableBodies}
            locale="el"
        />,
    );
}

describe('CityNotificationCard in a municipality without notifications (#829)', () => {
    it('shows nothing when no body there may be followed', () => {
        const { container } = renderCard(false, []);
        expect(container).toBeEmptyDOMElement();
    });

    it('offers the one body that may be followed, with its tick on in the signup', () => {
        renderCard(false, [youth]);
        expect(screen.getByText('Δημοτικό Συμβούλιο Νέων')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'notisCta' })).toHaveAttribute('href', '/preveza/notifications?step=2&body=ab_youth');
    });

    it('offers several bodies through the signup, which lists them', () => {
        renderCard(false, [youth, other]);
        expect(screen.getByText('Δημοτικό Συμβούλιο Νέων · Άλλο όργανο')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'notisCta' })).toHaveAttribute('href', '/preveza/notifications?step=2');
    });

    it('tells a follower that they get the updates, and links to their choices', () => {
        renderCard(false, [youth], preference(['ab_youth']));
        expect(screen.getByText('bodyFollowFollowing')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'notisCta' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'changePreferences' })).toHaveAttribute('href', '/preveza/notifications?step=2');
    });
});

describe('CityNotificationCard in a municipality with notifications', () => {
    it('invites the reader to the municipality, whatever its bodies', () => {
        renderCard(true, [youth]);
        expect(screen.getByText('notis invite')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'notisCta' })).not.toBeInTheDocument();
    });
});
