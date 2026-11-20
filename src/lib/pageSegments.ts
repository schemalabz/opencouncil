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

/** The shape of a city id. A segment of another shape is never a city. */
export const VALID_CITY_ID = /^[a-z][a-z0-9_-]*$/;

/**
 * The segment that must be a city id for the path to be a page, or `null`
 * when the path is the home page or a page of PAGE_SEGMENTS.
 *
 * Every other first segment matches `[cityId]`, and Next renders the pages
 * below it, with their queries, at the same time as the city layout that
 * answers 404. The proxy checks the segment against the cities before
 * anything renders.
 */
export function cityIdCandidate(pathname: string): string | null {
    const segment = stripLocalePrefix(pathname).split('/')[1];
    if (!segment || PAGE_SEGMENTS.includes(segment)) return null;
    return segment;
}
