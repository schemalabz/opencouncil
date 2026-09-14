import { localePrefixPattern } from '@/i18n/config';

// Pure helpers behind the install prompt (src/components/pwa/InstallPrompt.tsx).
// No DOM access here, so the rules stay testable without a browser.

/** localStorage key holding the epoch millis of the last "Not now". */
export const INSTALL_PROMPT_DISMISSED_KEY = 'oc-install-prompt-dismissed';

/** localStorage key set once the app is installed from this browser. */
export const APP_INSTALLED_KEY = 'oc-app-installed';

/** How long a "Not now" silences the prompt. */
export const INSTALL_PROMPT_DISMISSAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Delay after mount before the prompt opens, so the page paints first. */
export const INSTALL_PROMPT_DELAY_MS = 1500;

/**
 * Paths where the prompt never shows: embeds run inside third-party iframes,
 * the presentation view runs on a council-room screen, and share pages are
 * rendered for images. Built from the shared locale-prefix set, like
 * EMBED_PATH in src/lib/utils/embed.ts.
 */
export const INSTALL_PROMPT_EXCLUDED_PATH = new RegExp(
    `^/(?:(?:${localePrefixPattern})/)?(?:embed|present|share)(?:/|$)`,
);

/**
 * How this browser can install the app:
 * - `native`: the browser fired `beforeinstallprompt` (Chromium on Android
 *   and desktop), so one button installs.
 * - `ios`: Safari and every other iOS browser install through the share
 *   sheet only. The prompt shows those steps.
 * - `android`: a non-Chromium Android browser, or Chromium before its event
 *   fires. The prompt shows the browser-menu steps and upgrades to `native`
 *   when the event arrives.
 * - `unsupported`: a desktop browser without the event. The prompt stays
 *   hidden.
 */
export type InstallPlatform = 'native' | 'ios' | 'android' | 'unsupported';

/** The `beforeinstallprompt` event, which lib.dom does not type. */
export interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Platform from the user agent. iPadOS reports itself as a Mac, so a Mac with
 * a touch screen counts as iOS.
 */
export function detectInstallPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
    if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
    if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
    if (/Android/.test(userAgent)) return 'android';
    return 'unsupported';
}

/** Whether a stored "Not now" timestamp still silences the prompt at `now`. */
export function isDismissalActive(storedValue: string | null, now: number): boolean {
    if (storedValue === null) return false;
    const dismissedAt = Number(storedValue);
    if (!Number.isFinite(dismissedAt)) return false;
    return now - dismissedAt < INSTALL_PROMPT_DISMISSAL_MS;
}

/**
 * Whether the page already runs as an installed app. `navigator.standalone`
 * is the iOS signal; the media query covers everything else.
 */
export function isStandaloneDisplay(win: Window): boolean {
    const nav = win.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    return typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
}
