import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { CompleteScreen, CompleteAside } from '../CompleteScreen';
import type { CityWithGeometry } from '@/lib/db/cities';

jest.mock('next-intl', () => ({
    useTranslations: (namespace?: string) => (key: string, values?: Record<string, string>) => {
        if (values?.email) return `${key}:${values.email}`;
        if (values?.phone) return `${key}:${values.phone}`;
        return `${namespace || ''}.${key}`;
    },
    useLocale: () => 'el',
}));

jest.mock('@/i18n/routing', () => ({
    Link: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) =>
        createElement('a', { href, className }, children),
}));

jest.mock('@/components/signup/useCelebration', () => ({
    useCelebration: () => {},
}));

jest.mock('@/lib/formatters/name', () => ({
    getMunicipalityQualifier: () => 'δήμου Χανίων',
}));

const mockCity = {
    id: 'chania',
    name: 'Χανιά',
    name_en: 'Chania',
    name_municipality: 'Δήμος Χανίων',
    name_municipality_en: 'Municipality of Chania',
    status: 'supported',
    supportsNotifications: true,
    timezone: 'Europe/Athens',
    realm: 'greece',
} as unknown as CityWithGeometry;

describe('CompleteScreen and CompleteAside meanwhile links', () => {
    it('shows the preferences link pointing to the profile when the user is signed in', () => {
        render(
            <CompleteScreen
                city={mockCity}
                locations={[]}
                phone=""
                email="user@example.com"
                phoneChannel={false}
                known={false}
                signedIn={true}
            />,
        );

        const meetingLinks = screen.getAllByRole('link', { name: /meanwhileMeeting/i });
        expect(meetingLinks.some((link) => link.getAttribute('href') === '/chania')).toBe(true);

        const preferencesLink = screen.getByRole('link', { name: /meanwhilePreferences/i });
        expect(preferencesLink.getAttribute('href')).toBe('/profile?tab=notifications');
    });

    it('does not render the preferences or sign-in link when the user is signed out', () => {
        render(
            <CompleteScreen
                city={mockCity}
                locations={[]}
                phone=""
                email="newuser@example.com"
                phoneChannel={false}
                known={false}
                signedIn={false}
            />,
        );

        const meetingLinks = screen.getAllByRole('link', { name: /meanwhileMeeting/i });
        expect(meetingLinks.some((link) => link.getAttribute('href') === '/chania')).toBe(true);

        const preferencesLink = screen.queryByRole('link', { name: /meanwhilePreferences/i });
        expect(preferencesLink).not.toBeInTheDocument();

        const signInLink = screen.queryByRole('link', { name: /sign-in/i });
        expect(signInLink).not.toBeInTheDocument();

        // Verifies the magic link prompt is shown for signed-out users
        expect(screen.getByText(/signup\.doneMagicLink/)).toBeInTheDocument();
    });

    it('CompleteAside only includes the preferences link when signed in', () => {
        const { unmount } = render(<CompleteAside city={mockCity} signedIn={true} />);
        expect(screen.getByRole('link', { name: /meanwhilePreferences/i })).toHaveAttribute(
            'href',
            '/profile?tab=notifications',
        );
        unmount();

        render(<CompleteAside city={mockCity} signedIn={false} />);
        expect(screen.queryByRole('link', { name: /meanwhilePreferences/i })).not.toBeInTheDocument();
    });
});
