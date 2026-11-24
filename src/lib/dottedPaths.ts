import { VIDEO_LINK_ROUTE, YOUTUBE_HOSTS } from '@/lib/utils/videoLinkRewrites.mjs';

/**
 * Which paths with a dot the app serves.
 *
 * No page has a dot in its path. A request for a path with a dot is a file, a
 * metadata route, a pasted video link, or a path that does not exist. The
 * proxy answers 404 for the last kind. Without that answer the path matches
 * `[locale]` with its first segment as the locale, and the pages below it run
 * their queries before the locale layout answers 404 (see cityIdCandidate).
 *
 * The lists are written by hand so that the proxy does not read the disk. The
 * test fails when a file in `public/` is not covered.
 */

/** Files at the root of `public/`. */
export const PUBLIC_ROOT_FILES = [
    'RobotoMono.ttf',
    'favicon.ico',
    'favicon.svg',
    'llms.txt',
    'logo.png',
    'oc-theme.png',
    'osektutu-wordmark.png',
    'square.png',
    'sw.js',
    'white-logo.png',
];

/**
 * Directories at the root of `public/`. `consultations` is not in git: a
 * developer copies a regulation file there (see `.gitignore`).
 */
export const PUBLIC_DIRS = ['about', 'brochure', 'consultations', 'fonts', 'icons', 'logos', 'og', 'people'];

/** The file types under PUBLIC_DIRS. `/about/.env` is not a file of the app. */
const PUBLIC_FILE = /^(?:\/[\w-]+)+\.(?:jpe?g|json|png|svg|ttf|webp|woff2)$/;

/** Next's metadata routes: `robots.ts`, `sitemap.ts` and `manifest.ts` in `src/app`. */
const METADATA_FILES = ['robots.txt', 'sitemap.xml', 'manifest.webmanifest'];

/** Route handlers whose parameter can have a dot: a video link, a QR code. */
const DOTTED_PARAM_ROUTES = [VIDEO_LINK_ROUTE.slice(1), 'qr'];

const SCHEMES = ['http:', 'https:'];

/**
 * `null` for a path without a dot: this module has nothing to say about it.
 * `serve` for a path that Next must answer, with no other work in the proxy.
 * `reject` for a path that the app does not have.
 */
export function dottedPathVerdict(pathname: string): 'serve' | 'reject' | null {
    if (!pathname.includes('.')) return null;

    const segments = pathname.slice(1).split('/');
    const [first, second] = segments;

    // The two shapes that videoLinkRewrites() rewrites. Next matches a
    // rewrite without regard to case.
    const host = (segment: string | undefined) => segment !== undefined && YOUTUBE_HOSTS.includes(segment.toLowerCase());
    if (host(first)) return 'serve';
    if (SCHEMES.includes(first.toLowerCase()) && host(second)) return 'serve';
    if (DOTTED_PARAM_ROUTES.includes(first)) return 'serve';

    if (segments.length === 1) {
        return PUBLIC_ROOT_FILES.includes(first) || METADATA_FILES.includes(first) ? 'serve' : 'reject';
    }
    if (PUBLIC_DIRS.includes(first) && PUBLIC_FILE.test(pathname)) return 'serve';

    return 'reject';
}
