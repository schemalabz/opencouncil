import { DEFAULT_LOCALE, LOCALES, urlPrefixForLocale } from '@/i18n/config';
import { safeRedirectPath } from '@/lib/safeRedirect';

const NON_DEFAULT_LOCALE_PREFIXES = LOCALES.filter((l) => l !== DEFAULT_LOCALE).map(urlPrefixForLocale).join('|');
const LOCALE_PREFIX_REGEX = new RegExp(`^/(?:${NON_DEFAULT_LOCALE_PREFIXES})(?=/|$)`);

/**
 * Derives the safe, locale-aware municipality destination (e.g. `/{cityId}`
 * or `/{locale}/{cityId}`) for post-signup magic link redirection.
 *
 * If `returnTo` carries a supported non-default locale prefix (e.g. `/en/...`,
 * `/lat/...`), that prefix is preserved so the newly authenticated reader lands
 * on the municipality page in their selected language.
 */
export function municipalityDestination(cityId: string, returnTo?: string): string {
    let prefix = '';
    if (typeof returnTo === 'string') {
        const match = returnTo.match(LOCALE_PREFIX_REGEX);
        if (match) {
            prefix = match[0];
        }
    }
    const target = `${prefix}/${encodeURIComponent(cityId)}`;
    return safeRedirectPath(target, `/${encodeURIComponent(cityId)}`);
}
