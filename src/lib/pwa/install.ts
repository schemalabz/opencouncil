// Pure helpers behind the "Install app" entry (src/hooks/useInstallApp.ts).
// No DOM access here, so the rules stay testable without a browser.

/**
 * How this browser can install the app:
 * - `native`: the browser fired `beforeinstallprompt` (Chromium on Android
 *   and desktop), so one click installs.
 * - `ios`: Safari and every other iOS browser install through the share
 *   sheet only. The entry shows those steps.
 * - `android`: a non-Chromium Android browser, or Chromium before its event
 *   fires. The entry shows the browser-menu steps, and switches to `native`
 *   when the event arrives.
 * - `installed`: the page already runs as the installed app.
 * - `unsupported`: a desktop browser without the event. The entry is hidden.
 */
export type InstallPlatform = 'native' | 'ios' | 'android' | 'installed' | 'unsupported';

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

/**
 * Whether the page already runs as an installed app. `navigator.standalone`
 * is the iOS signal; the media query covers everything else.
 */
export function isStandaloneDisplay(win: Window): boolean {
    const nav = win.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    return typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
}
