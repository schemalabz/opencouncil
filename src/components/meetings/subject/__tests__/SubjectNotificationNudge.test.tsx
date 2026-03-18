import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SubjectNotificationNudge } from '../SubjectNotificationNudge';

// Mock heavy Radix UI Dialog to avoid OOM
jest.mock('@/components/ui/dialog', () => ({
    Dialog: ({ children, open, onOpenChange }: any) =>
        open ? (
            <div role="dialog" data-testid="dialog">
                <button onClick={() => onOpenChange && onOpenChange(false)}>Close</button>
                {children}
            </div>
        ) : null,
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

jest.mock('@/components/icon', () => ({
    __esModule: true,
    default: ({ name }: any) => <span data-testid={`icon-${name}`} />,
}));

// Mock the hook
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

jest.mock('../SubjectSubscribeContext', () => ({
    useSubjectSubscribeContext: jest.fn(() => defaultHookResult),
}));

// Mock next-intl
jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, string>) =>
        ({
            nudgeTitle: 'Stay informed',
            nudgeDescription: `Sign up for notifications in ${params?.cityName ?? ''}`,
            subscribeTo: 'Get notified about:',
            subscribe: 'Subscribe',
            dismiss: 'Dismiss',
            notNow: 'Not now',
            goToNotifications: 'Go to notifications',
            alreadySubscribed: 'Already subscribed',
            subscribeSuccess: 'Subscribed!',
            subscribeSuccessDescription: 'You will receive notifications',
            manageNotifications: 'Manage notifications',
            confirmSubscribe: 'Confirm',
        }[key] ?? key),
    useLocale: () => 'el',
}));

// Mock next-intl routing Link to avoid intl context requirement
jest.mock('@/i18n/routing', () => ({
    Link: ({ children, href, onClick }: any) => <a href={href} onClick={onClick}>{children}</a>,
}));

// Mock toast
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
}));

import { useSubjectSubscribeContext } from '../SubjectSubscribeContext';
const mockUseSubjectSubscribeContext = useSubjectSubscribeContext as jest.MockedFunction<typeof useSubjectSubscribeContext>;

const mockTopic = {
    id: 'topic-1',
    name: 'Environment',
    name_en: 'Environment',
    colorHex: '#00ff00',
    icon: 'Leaf',
};

const mockLocation = {
    id: 'loc-1',
    text: 'Central Square',
    coordinates: { x: 22.9, y: 40.6 },
};

// Helper to advance past the 25-second trigger delay
const triggerTimer = () => {
    act(() => {
        jest.advanceTimersByTime(25_000);
    });
};

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    sessionStorage.clear();
    mockUseSubjectSubscribeContext.mockReturnValue({ ...defaultHookResult });
});

describe('SubjectNotificationNudge', () => {
    it('does not show modal when topic is null', () => {
        render(<SubjectNotificationNudge topic={null} location={null} cityName="Athens" />);
        triggerTimer();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not show modal when already subscribed', () => {
        mockUseSubjectSubscribeContext.mockReturnValue({ ...defaultHookResult, alreadySubscribed: true });
        render(<SubjectNotificationNudge topic={mockTopic as any} location={null} cityName="Athens" />);
        triggerTimer();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not show modal when dismissed flag is set', () => {
        mockUseSubjectSubscribeContext.mockReturnValue({ ...defaultHookResult, isDismissed: true });
        render(<SubjectNotificationNudge topic={mockTopic as any} location={null} cityName="Athens" />);
        triggerTimer();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows modal after 25 seconds when conditions are met', () => {
        render(<SubjectNotificationNudge topic={mockTopic as any} location={null} cityName="Athens" />);
        triggerTimer();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('calls dismiss when "Not now" button is clicked', () => {
        render(<SubjectNotificationNudge topic={mockTopic as any} location={null} cityName="Athens" />);
        triggerTimer();
        fireEvent.click(screen.getByRole('button', { name: /not now/i }));
        expect(mockDismiss).toHaveBeenCalledTimes(1);
    });

    it('shows topic and location checkboxes for authenticated user reflecting subscription state', () => {
        render(<SubjectNotificationNudge topic={mockTopic as any} location={mockLocation as any} cityName="Athens" />);
        triggerTimer();
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes.length).toBeGreaterThanOrEqual(2);
        // checkboxes reflect current subscription state (both false = unchecked by default)
        checkboxes.forEach(cb => expect(cb).not.toBeChecked());
    });

    it('shows a link for unauthenticated user instead of checkboxes', () => {
        mockUseSubjectSubscribeContext.mockReturnValue({ ...defaultHookResult, isAuthenticated: false });
        render(<SubjectNotificationNudge topic={mockTopic as any} location={null} cityName="Athens" />);
        triggerTimer();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /notifications/i })).toBeInTheDocument();
    });
});
