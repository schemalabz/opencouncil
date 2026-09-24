import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { ProfileSettings, type ProfileAccount } from '../ProfileSettings';

let mockSearch = '';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));
jest.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) =>
        createElement('a', { href, className }, children),
    usePathname: () => '/profile',
}));
jest.mock('@/components/profile/AccountSection', () => ({ AccountSection: () => null }));
jest.mock('@/components/profile/CommunicationPreferences', () => ({ CommunicationPreferences: () => null }));
jest.mock('@/components/profile/NotificationPreferencesSection', () => ({ NotificationPreferencesSection: () => null }));
jest.mock('@/components/profile/UserInfoForm', () => ({ UserInfoForm: () => null }));

const user: ProfileAccount = {
    name: 'Μαρία Παπαδοπούλου',
    email: 'maria@example.com',
    phone: null,
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    allowProductUpdates: true,
    allowPetitionUpdates: false,
    allowFeedbackCalls: true,
};

function renderSettings(promo?: React.ReactNode) {
    return render(<ProfileSettings user={user} persons={[]} highlightsAllowed={false} promo={promo} />);
}

const promo = <p>notis-invite</p>;

beforeEach(() => {
    mockSearch = '';
});

describe('ProfileSettings invitation to the notifications', () => {
    it('shows one copy, between the tab strip and the tab content', () => {
        renderSettings(promo);

        const invite = screen.getByText('notis-invite');
        const lastTab = screen.getByRole('link', { name: 'tabAccount' });
        const heading = screen.getByRole('heading', { name: 'tabPersonal' });
        expect(lastTab.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(invite.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('leaves while the notifications tab, which has its own call to action, is open', () => {
        mockSearch = 'tab=notifications';
        renderSettings(promo);

        expect(screen.queryByText('notis-invite')).not.toBeInTheDocument();
    });

    it('stays on the other tabs', () => {
        mockSearch = 'tab=communication';
        renderSettings(promo);

        expect(screen.getAllByText('notis-invite')).toHaveLength(1);
    });

    it('follows the tab that the tabs select, so an unknown value shows the default tab', () => {
        mockSearch = 'tab=unknown';
        renderSettings(promo);

        expect(screen.getByRole('heading', { name: 'tabPersonal' })).toBeInTheDocument();
        expect(screen.getAllByText('notis-invite')).toHaveLength(1);
    });

    it('renders nothing for a reader who already signed up', () => {
        renderSettings();

        expect(screen.queryByText('notis-invite')).not.toBeInTheDocument();
    });
});
