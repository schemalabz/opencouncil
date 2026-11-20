import { stripLocalePrefix } from '@/i18n/config';

/**
 * The first path segment of every page that is not a city page: the
 * directories of `src/app/[locale]`, without the route groups. The test fails
 * when a directory is not in this list.
 */
export const PAGE_SEGMENTS = [
    'about',
    'admin',
    'bodies',
    'brochure',
    'claim',
    'corrections',
    'docs',
    'embed',
    'explain',
    'mcp',
    'notifications',
    'offer-letter',
    'offline',
    'petition',
    'present',
    'privacy',
    'profile',
    'search',
    'share',
    'sign-in',
    'terms',
    'unsubscribe',
];

/**
 * The segment that must be a city id for the path to be a page, or `null`
 * when the path is the home page or a page of PAGE_SEGMENTS.
 *
 * Every other first segment matches `[cityId]`. Next renders the segments of
 * a route in parallel, so the pages below `[cityId]` run their queries while
 * the city layout decides on its 404. The proxy checks the segment against
 * the cities before anything renders. `dottedPathVerdict` and the api
 * catch-all route answer 404 early for the same reason.
 */
export function cityIdCandidate(pathname: string): string | null {
    const segment = decodeSegment(stripLocalePrefix(pathname).split('/')[1]);
    if (!segment || PAGE_SEGMENTS.includes(segment)) return null;
    return segment;
}

/** Next decodes the path before it matches a route: `/%61bout` is the about page. */
function decodeSegment(segment: string | undefined): string | undefined {
    if (segment === undefined) return undefined;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}
