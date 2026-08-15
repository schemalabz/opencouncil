import { REALMS, REALM_OVERRIDE_COOKIE, effectiveRealm } from '@/lib/realm';
import { SERBIAN_SCRIPT_COOKIE } from '@/lib/seo-redirects';
import type { AppLocale } from '@/i18n/config';
import { hostFromRequest, readCookie } from './requestHeaders';

/**
 * The UI locale to write a transactional email in, derived from the domain the
 * request arrived on: a sign-in started on opencouncil.rs gets a Serbian email,
 * not a Greek one.
 *
 * Host-derived rather than read from next-intl, because this runs inside
 * Auth.js' provider callbacks — outside any next-intl request scope, and inside
 * a module the middleware bundle reaches (so no server-only imports here). The
 * realm override cookie is honored so previews (`?realm=serbia`) send the same
 * email production would; the Serbian script cookie picks the reader's chosen
 * script, which is the one thing the realm alone cannot tell us.
 *
 * Realm-derived by design, which means it returns only a realm's default locale —
 * never `en`. Someone signing in from `opencouncil.gr/en` gets the Greek email.
 * The magic link's `callbackUrl` carries the locale-prefixed path they came from
 * if we ever want that signal; until then the `en` rows in the email copy tables
 * are unreachable by this path (`BaseTemplate` can still be handed `en` directly).
 */
export function localeForRequest(request: Request): AppLocale {
    const realm = effectiveRealm(
        hostFromRequest(request),
        readCookie(request, REALM_OVERRIDE_COOKIE),
    );

    if (realm === 'serbia' && readCookie(request, SERBIAN_SCRIPT_COOKIE) === 'latn') {
        return 'sr-Latn';
    }

    return REALMS[realm].defaultLocale;
}
