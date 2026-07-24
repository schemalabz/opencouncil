import { Realm } from '@prisma/client';

/**
 * Realm (tenant) configuration. A single deployment serves all domains off one
 * database; the realm a request belongs to is resolved from its Host header (see
 * `realmForHost`). This is the single source of truth mapping each realm to its
 * canonical production domain and default UI locale.
 *
 * A realm's domain may be a subdomain of another realm's domain; `realmForHost`
 * matches the most specific domain first, so the parent realm only claims hosts
 * no child realm does.
 *
 * Pure module — no `next/headers`/server-only imports — so it is safe to use from
 * client components (the footer country-switcher) and the edge/middleware bundle
 * (`proxy.ts`). The request-scoped resolver lives in `realm.server.ts`.
 */
export const REALMS = {
    greece: { domain: 'opencouncil.gr', defaultLocale: 'el', country: 'gr' },
    france: { domain: 'opencouncil.fr', defaultLocale: 'fr', country: 'fr' },
    cyprus: { domain: 'opencouncil.cy', defaultLocale: 'el', country: 'cy' },
} as const satisfies Record<Realm, { domain: string; defaultLocale: 'el' | 'fr'; country: string }>;

/**
 * All realms in `REALMS` declaration order, for UIs that enumerate realms
 * (admin tables, selects). Derive such lists from here — a hardcoded subset
 * silently drops rows for realms it doesn't know about.
 */
export const ALL_REALMS = Object.keys(REALMS) as Realm[];

/**
 * Localized display name of a realm's country (e.g. "Ελλάδα" in el, "Grèce"
 * in fr), derived via `Intl.DisplayNames` from the country code already in
 * `REALMS` — no per-realm labels or translation keys to maintain anywhere.
 */
export function getRealmDisplayName(realm: Realm, locale: string): string {
    const country = REALMS[realm].country.toUpperCase();
    return new Intl.DisplayNames([locale], { type: 'region' }).of(country) ?? country;
}

/**
 * Fallback map view (center `[lng, lat]` + zoom) for a realm, used when a city has
 * no stored geometry so the map still opens over the right country rather than
 * defaulting to Greece. A city with geometry always overrides this.
 */
const REALM_DEFAULT_MAP_VIEW: Record<Realm, { center: [number, number]; zoom: number }> = {
    greece: { center: [23.7275, 37.9838], zoom: 5 }, // Athens
    france: { center: [2.4, 46.6], zoom: 5 },        // metropolitan France
    cyprus: { center: [33.2, 35.0], zoom: 8 },       // island of Cyprus
};

const hostMatchesDomain = (host: string, domain: string): boolean =>
    host === domain || host.endsWith(`.${domain}`);

/**
 * Builds a resolver mapping a Host header value to a realm of `realms`, or null
 * when none matches. The port is stripped and the host lowercased so
 * `localhost:3000`-style hosts and a spoofed `Host: opencouncil.fr` both work;
 * each realm's domain matches as the apex or any subdomain (so preview hosts
 * like `pr-7.preview.opencouncil.fr` resolve correctly). Domains are checked
 * most-specific (longest) first — a subdomain is always longer than its parent
 * domain — so a realm hosted on a subdomain of another realm's domain wins over
 * the parent regardless of declaration order.
 *
 * A factory so the specificity ordering is computed once per realm map, not per
 * request — resolution stays free in the proxy hot path, which is the point of
 * keeping realm config in code. Parameterized so the ordering contract stays
 * testable independent of the realms in production; app code should use
 * `realmForHost`.
 */
export function createRealmResolver<R extends string>(
    realms: Record<R, { domain: string }>,
): (host: string | null | undefined) => R | null {
    const bySpecificity = (Object.entries(realms) as [R, { domain: string }][])
        .sort(([, a], [, b]) => b.domain.length - a.domain.length);
    return (host) => {
        const normalized = (host ?? '').split(':')[0].toLowerCase();
        for (const [realm, { domain }] of bySpecificity) {
            if (hostMatchesDomain(normalized, domain)) {
                return realm;
            }
        }
        return null;
    };
}

const resolveRealm = createRealmResolver(REALMS);

/**
 * The realm a Host header value belongs to, defaulting to `greece` for unknown
 * hosts (localhost, direct-IP requests).
 */
export function realmForHost(host: string | null | undefined): Realm {
    return resolveRealm(host) ?? 'greece';
}

/**
 * Whether a Host header value is one of our own domains (apex or subdomain of a
 * realm domain — so production and preview hosts match, but `localhost` and any
 * attacker-supplied host do not). Unlike `realmForHost` (which defaults unknown
 * hosts to `greece`), this is a strict membership check — use it before trusting
 * a request's Host for anything sensitive, e.g. building a magic-link URL.
 */
export function isKnownRealmHost(host: string | null | undefined): boolean {
    const normalized = (host ?? '').split(':')[0].toLowerCase();
    if (!normalized) return false;
    return Object.values(REALMS).some(({ domain }) => hostMatchesDomain(normalized, domain));
}

/**
 * Derives each realm's foreign locale prefixes: default locales of other realms
 * that differ from the realm's own default (e.g. `fr` on opencouncil.gr). The
 * proxy 301s these to the unprefixed URL; `en` is shared by all realms and is
 * never foreign.
 *
 * Filtered by locale rather than by realm: realms may share a default locale,
 * and a realm's own default is never foreign on its host no matter which other
 * realm also uses it. Parameterized so that property stays testable
 * independent of the realms production defines; app code should use
 * `foreignLocalesForRealm`, which reads the result precomputed from `REALMS`
 * at module load — this runs in the proxy hot path, and the realm config being
 * static is what keeps per-request work at zero.
 */
export function computeForeignLocales<R extends string>(
    realms: Record<R, { defaultLocale: string }>,
): Record<R, string[]> {
    const allLocales = Object.values<{ defaultLocale: string }>(realms)
        .map(({ defaultLocale }) => defaultLocale);
    const entries = (Object.keys(realms) as R[]).map((realm) => {
        const own = realms[realm].defaultLocale;
        return [realm, [...new Set(allLocales.filter((locale) => locale !== own))]];
    });
    return Object.fromEntries(entries) as Record<R, string[]>;
}

const FOREIGN_LOCALES = computeForeignLocales(REALMS);

/** A realm's foreign locale prefixes, precomputed from `REALMS`. */
export function foreignLocalesForRealm(realm: Realm): string[] {
    return FOREIGN_LOCALES[realm];
}

/**
 * Canonical absolute base URL for a realm (e.g. `https://opencouncil.fr`). Used
 * for SEO metadata, sitemaps, hreflang/canonical links and the footer switcher's
 * cross-domain redirect.
 */
export function getRealmBaseUrl(realm: Realm): string {
    return `https://${REALMS[realm].domain}`;
}

/** Bare domain for a realm (e.g. `opencouncil.fr`), for display in URL chrome. */
export function getRealmDomain(realm: Realm): string {
    return REALMS[realm].domain;
}

/**
 * Google Places geocoding parameters for a realm: the ISO country to restrict
 * autocomplete to and the response language. Keeps address search scoped to the
 * right country (e.g. France on opencouncil.fr) instead of hardcoding Greece.
 */
export function getRealmGeocoding(realm: Realm): { country: string; language: string } {
    return { country: REALMS[realm].country, language: REALMS[realm].defaultLocale };
}

/** Fallback map center/zoom for a realm, used when a city has no stored geometry. */
export function getRealmDefaultMapView(realm: Realm): { center: [number, number]; zoom: number } {
    return REALM_DEFAULT_MAP_VIEW[realm];
}
