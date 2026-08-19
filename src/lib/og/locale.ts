import type { Realm } from '@prisma/client';
import { LOCALES, type AppLocale } from '@/i18n/config';
import { REALMS } from '@/lib/realm';

/** Query parameter the pages use to tell `/api/og` which locale to render in. */
export const OG_LOCALE_PARAM = 'locale';

/**
 * The locale an OG image renders in.
 *
 * `/api/og` sits outside the `[locale]` segment — the proxy skips `/api` for
 * i18n routing — so the endpoint has no locale of its own. Pages pass theirs
 * explicitly (see `buildOgImageUrl`), which is the only way to get the locale right
 * for a page served on a non-default locale of its realm (`/en` on
 * opencouncil.gr, `/lat` on opencouncil.rs).
 *
 * Without a usable parameter — an old cached URL, a hand-written share link —
 * the realm's default locale is the best guess, because it is the language the
 * readers of that host see: `fr` on opencouncil.fr, `sr` on opencouncil.rs.
 */
export function resolveOgLocale(requested: string | null | undefined, realm: Realm): AppLocale {
    if (requested && (LOCALES as readonly string[]).includes(requested)) {
        return requested as AppLocale;
    }
    return REALMS[realm].defaultLocale;
}

/**
 * Relative URL of a page's `/api/og` image. Next resolves it against
 * `metadataBase` (the request's realm domain), so every realm serves its own.
 *
 * Build every OG image URL through this: the locale is what the endpoint cannot
 * work out on its own, and a caller that forgets it silently falls back to the
 * realm default.
 */
export function buildOgImageUrl(locale: string, params: Record<string, string>): string {
    return `/api/og?${new URLSearchParams({ ...params, [OG_LOCALE_PARAM]: locale })}`;
}
