/**
 * SubjectSubscribeButton tests.
 * We mock all heavy imports (Next.js, Radix, server actions) to avoid OOM
 * during module loading in the Nix test environment.
 */

// ---- Module mocks (must be before imports) ----

jest.mock('next-auth/react', () => ({
    useSession: jest.fn(() => ({ data: { user: {} }, status: 'authenticated' })),
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) =>
        ({ subscribe: 'Subscribe', alreadySubscribed: 'Already subscribed', subscribeTo: 'Get notified about:', confirmSubscribe: 'Confirm', subscribeSuccess: 'Subscribed!', subscribeSuccessDescription: 'Desc', manageNotifications: 'Manage' })[key] ?? key,
    useLocale: () => 'el',
}));

jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/db/notifications', () => ({
    getUserPreferences: jest.fn().mockResolvedValue([]),
    saveNotificationPreferences: jest.fn(),
}));

jest.mock('@/components/ui/popover', () => ({
    Popover: ({ children, open }: any) => open ? <div data-testid="popover">{children}</div> : <>{children}</>,
    PopoverTrigger: ({ children }: any) => <>{children}</>,
    PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, disabled, asChild, ...props }: any) => {
        // When asChild, render the child element directly (e.g. an <a href>)
        if (asChild) return children;
        return <button onClick={onClick} disabled={disabled} {...props}>{children}</button>;
    },
}));

jest.mock('@/components/icon', () => ({
    __esModule: true,
    default: ({ name }: any) => <span data-testid={`icon-${name}`} />,
}));

jest.mock('@/i18n/routing', () => ({
    Link: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// Spy on useSubjectSubscribeContext
jest.mock('../SubjectSubscribeContext', () => ({
    useSubjectSubscribeContext: jest.fn(),
}));

// ---- Actual imports ----

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSubjectSubscribeContext } from '../SubjectSubscribeContext';

// This must be after jest.mock declarations
const mockToast = jest.fn();
const mockSave = jest.fn();
const mockDismiss = jest.fn();

const defaultHookResult = {
    isAuthenticated: true,
    alreadySubscribed: false,
    hasAnyPreferences: false,
    isTopicSubscribed: false,
    isLocationSubscribed: false,
    isLoading: false,
    isSaving: false,
    save: mockSave,
    notificationsPageUrl: '/city-1/notifications',
    isDismissed: false,
    dismiss: mockDismiss,
};

const mockUseSubjectSubscribeContext = useSubjectSubscribeContext as jest.MockedFunction<typeof useSubjectSubscribeContext>;

// Lazy import so mocks take effect first
let SubjectSubscribeButton: any;

beforeAll(async () => {
    const mod = await import('../SubjectSubscribeButton');
    SubjectSubscribeButton = mod.SubjectSubscribeButton;
});

beforeEach(() => {
    jest.clearAllMocks();
    mockUseSubjectSubscribeContext.mockReturnValue({ ...defaultHookResult });
});

const mockTopic = { id: 'topic-1', name: 'Environment', name_en: 'Environment', colorHex: '#00ff00', icon: 'Leaf' };
const mockLocation = { id: 'loc-1', text: 'Central Square', coordinates: { x: 22.9, y: 40.6 } };

describe('SubjectSubscribeButton', () => {
    it('renders nothing when no topic provided', () => {
        const { container } = render(<SubjectSubscribeButton topic={null} location={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('shows subscribe button when topic exists', () => {
        render(<SubjectSubscribeButton topic={mockTopic} location={null} />);
        expect(screen.getAllByRole('button')[0]).toBeInTheDocument();
    });

    it('opens popover when alreadySubscribed (button always clickable)', async () => {
        mockUseSubjectSubscribeContext.mockReturnValue({ ...defaultHookResult, alreadySubscribed: true, isTopicSubscribed: true });
        render(<SubjectSubscribeButton topic={mockTopic} location={null} />);
        fireEvent.click(screen.getAllByRole('button')[0]);
        await waitFor(() => {
            expect(screen.getByTestId('popover-content')).toBeInTheDocument();
        });
    });

    it('renders a link to notifications page for unauthenticated user', () => {
        mockUseSubjectSubscribeContext.mockReturnValue({ ...defaultHookResult, isAuthenticated: false });
        render(<SubjectSubscribeButton topic={mockTopic} location={null} />);
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', '/city-1/notifications');
    });

    it('shows popover with topic and location checkboxes for authenticated user', async () => {
        render(<SubjectSubscribeButton topic={mockTopic} location={mockLocation} />);
        fireEvent.click(screen.getAllByRole('button')[0]);
        await waitFor(() => {
            expect(screen.getByTestId('popover-content')).toBeInTheDocument();
            const checkboxes = screen.getAllByRole('checkbox');
            expect(checkboxes).toHaveLength(2);
        });
    });

    it('calls save with boolean flags on confirm after checking the topic box', async () => {
        mockSave.mockResolvedValue(true);
        render(<SubjectSubscribeButton topic={mockTopic} location={null} />);
        fireEvent.click(screen.getAllByRole('button')[0]);
        await waitFor(() => screen.getByTestId('popover-content'));
        // topic starts unchecked (not subscribed); check it to enable the confirm button
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => {
            expect(mockSave).toHaveBeenCalledWith(true, false);
        });
    });
});
