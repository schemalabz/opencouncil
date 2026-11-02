import { localePathPrefix } from '@/i18n/config';

/**
 * A link from /admin to a page on a city's realm host, in the viewer's
 * language. `siteUrl` (from realmBaseUrl) is the host only, and the target
 * host does not detect the locale, so the link carries the prefix.
 */
export function realmPageUrl(siteUrl: string, locale: string, path: string): string {
    return `${siteUrl}${localePathPrefix(locale)}${path}`;
}
