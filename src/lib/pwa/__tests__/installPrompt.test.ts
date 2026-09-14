import {
    INSTALL_PROMPT_DISMISSAL_MS,
    INSTALL_PROMPT_EXCLUDED_PATH,
    detectInstallPlatform,
    isDismissalActive,
    isStandaloneDisplay,
} from '../installPrompt';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

describe('detectInstallPlatform', () => {
    it('recognises iPhone', () => {
        expect(detectInstallPlatform(IPHONE, 5)).toBe('ios');
    });

    it('treats a Mac with a touch screen as iPadOS', () => {
        expect(detectInstallPlatform(IPAD_AS_MAC, 5)).toBe('ios');
        expect(detectInstallPlatform(IPAD_AS_MAC, 0)).toBe('unsupported');
    });

    it('recognises Android', () => {
        expect(detectInstallPlatform(ANDROID, 5)).toBe('android');
    });

    it('leaves a desktop browser to the beforeinstallprompt event', () => {
        expect(detectInstallPlatform(WINDOWS, 0)).toBe('unsupported');
    });
});

describe('isDismissalActive', () => {
    const now = 1_800_000_000_000;

    it('is inactive with nothing stored', () => {
        expect(isDismissalActive(null, now)).toBe(false);
    });

    it('is active inside the week and inactive after it', () => {
        expect(isDismissalActive(String(now - INSTALL_PROMPT_DISMISSAL_MS + 1), now)).toBe(true);
        expect(isDismissalActive(String(now - INSTALL_PROMPT_DISMISSAL_MS), now)).toBe(false);
    });

    it('ignores an unreadable value', () => {
        expect(isDismissalActive('yesterday', now)).toBe(false);
    });
});

describe('INSTALL_PROMPT_EXCLUDED_PATH', () => {
    it.each([
        '/embed/meetings',
        '/en/embed/meetings',
        '/lat/embed',
        '/present/athens/m1',
        '/fr/present/paris/m1',
        '/share/excerpt',
    ])('excludes %s', (path) => {
        expect(INSTALL_PROMPT_EXCLUDED_PATH.test(path)).toBe(true);
    });

    it.each(['/', '/athens', '/en/athens/m1', '/embedded-widgets', '/presentation'])('keeps %s', (path) => {
        expect(INSTALL_PROMPT_EXCLUDED_PATH.test(path)).toBe(false);
    });
});

describe('isStandaloneDisplay', () => {
    const win = (standalone: boolean | undefined, matches: boolean) => ({
        navigator: { standalone },
        matchMedia: (query: string) => ({ matches: query === '(display-mode: standalone)' && matches }),
    }) as unknown as Window;

    it('reads the iOS flag', () => {
        expect(isStandaloneDisplay(win(true, false))).toBe(true);
    });

    it('reads the display-mode media query', () => {
        expect(isStandaloneDisplay(win(undefined, true))).toBe(true);
        expect(isStandaloneDisplay(win(undefined, false))).toBe(false);
    });
});
