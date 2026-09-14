import { createElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import InstallPrompt from '../InstallPrompt';
import { captureEvent } from '@/lib/analytics/capture';
import { APP_INSTALLED_KEY, INSTALL_PROMPT_DELAY_MS, INSTALL_PROMPT_DISMISSED_KEY } from '@/lib/pwa/installPrompt';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));
jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: { alt: string }) => createElement('img', { alt: props.alt }),
}));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

const DAY = 24 * 60 * 60 * 1000;

let standalone = false;

function setUserAgent(value: string) {
    Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed') {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: jest.Mock;
        userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = jest.fn(async () => undefined);
    event.userChoice = Promise.resolve({ outcome });
    act(() => { window.dispatchEvent(event); });
    return event;
}

const openPrompt = () => act(() => { jest.advanceTimersByTime(INSTALL_PROMPT_DELAY_MS); });

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.clear();
    standalone = false;
    window.history.pushState({}, '', '/athens');
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)' && standalone,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
    setUserAgent(IPHONE);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('InstallPrompt', () => {
    it('opens after a delay with the share-sheet steps on iOS', () => {
        render(<InstallPrompt />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        openPrompt();

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('iosStep1')).toBeInTheDocument();
        expect(screen.queryByText('install')).not.toBeInTheDocument();
        expect(captureEvent).toHaveBeenCalledWith('install_prompt_shown', { platform: 'ios' });
    });

    it('shows the browser-menu steps on Android until the browser offers to install', () => {
        setUserAgent(ANDROID);
        render(<InstallPrompt />);
        openPrompt();
        expect(screen.getByText('androidStep1')).toBeInTheDocument();

        fireBeforeInstallPrompt('accepted');

        expect(screen.getByText('install')).toBeInTheDocument();
        expect(screen.queryByText('androidStep1')).not.toBeInTheDocument();
    });

    it('replays the browser prompt and remembers an accepted install', async () => {
        setUserAgent(ANDROID);
        render(<InstallPrompt />);
        const event = fireBeforeInstallPrompt('accepted');
        expect(event.defaultPrevented).toBe(true);
        openPrompt();

        await act(async () => { fireEvent.click(screen.getByText('install')); });

        expect(event.prompt).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(localStorage.getItem(APP_INSTALLED_KEY)).toBe('1');
        expect(captureEvent).toHaveBeenCalledWith('install_prompt_answered', { outcome: 'accepted' });
    });

    it('treats a refused browser prompt as "Not now"', async () => {
        setUserAgent(ANDROID);
        render(<InstallPrompt />);
        fireBeforeInstallPrompt('dismissed');
        openPrompt();

        await act(async () => { fireEvent.click(screen.getByText('install')); });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).not.toBeNull();
        expect(localStorage.getItem(APP_INSTALLED_KEY)).toBeNull();
    });

    it('stays away for a week after "Not now"', () => {
        const { unmount } = render(<InstallPrompt />);
        openPrompt();
        fireEvent.click(screen.getByText('notNow'));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(captureEvent).toHaveBeenCalledWith('install_prompt_dismissed', { platform: 'ios' });
        unmount();

        render(<InstallPrompt />);
        openPrompt();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('returns once the week has passed', () => {
        localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, String(Date.now() - 8 * DAY));
        render(<InstallPrompt />);
        openPrompt();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('never shows inside the installed app', () => {
        standalone = true;
        render(<InstallPrompt />);
        openPrompt();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('never shows again once the app was installed', () => {
        localStorage.setItem(APP_INSTALLED_KEY, '1');
        render(<InstallPrompt />);
        openPrompt();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('stays hidden on a desktop browser that cannot install', () => {
        setUserAgent(WINDOWS);
        render(<InstallPrompt />);
        openPrompt();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens on a desktop browser once it offers to install', () => {
        setUserAgent(WINDOWS);
        render(<InstallPrompt />);
        fireBeforeInstallPrompt('accepted');
        openPrompt();
        expect(screen.getByText('install')).toBeInTheDocument();
    });

    it('stays hidden on embed pages', () => {
        window.history.pushState({}, '', '/en/embed/meetings');
        render(<InstallPrompt />);
        openPrompt();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
