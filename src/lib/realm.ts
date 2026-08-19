import { Realm } from '@prisma/client';
import type { Country } from '@/lib/apiTypes';

/**
 * The Athens office line — the number every realm shows unless it has one of its
 * own. Written the way it should be displayed; `telHref` derives the dialable form.
 */
const OFFICE_PHONE = '+30 211 198 0212';

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
    greece: { domain: 'opencouncil.gr', defaultLocale: 'el', country: 'GR', contactPhone: OFFICE_PHONE },
    france: { domain: 'opencouncil.fr', defaultLocale: 'fr', country: 'FR', contactPhone: OFFICE_PHONE },
    cyprus: { domain: 'opencouncil.cy', defaultLocale: 'el', country: 'CY', contactPhone: OFFICE_PHONE },
    // Serbian is digraphic: `sr` (Cyrillic) is the default, `sr-Latn` is the
    // realm-exclusive Latin variant reachable via the script switcher.
    // The Serbian number is a domestic toll-free line, so it is shown and
    // dialled in its national form rather than as +381.
    serbia: {
        domain: 'opencouncil.rs',
        defaultLocale: 'sr',
        extraLocales: ['sr-Latn'],
        country: 'RS',
        contactPhone: '0800 301167',
    },
} as const satisfies Record<
    Realm,
    {
        domain: string;
        defaultLocale: 'el' | 'fr' | 'sr';
        country: Country;
        extraLocales?: readonly string[];
        contactPhone: string;
    }
>;

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
    const country = REALMS[realm].country;
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
    serbia: { center: [20.457, 44.817], zoom: 6 },   // Belgrade
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
 * Cookie carrying a realm override on non-production hosts (see
 * `isRealmApexHost`). Set by the proxy when a request arrives with
 * `?realm=<realm>`; read by the proxy, `getRealm()` and `realmForBrowser()` so
 * previews and localhost can be viewed as any realm despite their Host
 * resolving elsewhere (preview hosts are subdomains of opencouncil.gr, and
 * some realm domains — e.g. opencouncil.rs — have no DNS yet).
 */
export const REALM_OVERRIDE_COOKIE = 'oc-realm';

/** Type guard: whether an arbitrary string names a configured realm. */
export function isRealm(value: string | null | undefined): value is Realm {
    // hasOwnProperty, not `in`: the value is attacker-controlled (a cookie)
    // and `in` walks the prototype chain ('toString' in REALMS is true).
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REALMS, value);
}

/**
 * Whether a Host header value is exactly a realm's canonical production apex
 * (`opencouncil.gr`, not `pr-7.preview.opencouncil.gr` or `localhost`). The
 * realm override is honored only on non-apex hosts: production domains must
 * stay deterministic per-Host for SEO and CDN sanity, while previews and local
 * dev — which can't reach other realms by Host at all — get the escape hatch.
 */
export function isRealmApexHost(host: string | null | undefined): boolean {
    const normalized = (host ?? '').split(':')[0].toLowerCase();
    if (!normalized) return false;
    return Object.values(REALMS).some(({ domain }) => normalized === domain);
}

/**
 * The active realm override, or undefined when there is none: the override
 * cookie's value when it names a realm and the host is not a production apex.
 * The single decision point for whether an override applies — shared by the
 * proxy, `getRealm()` and `realmForBrowser()` so the gating rule can't drift.
 */
export function realmOverride(
    host: string | null | undefined,
    overrideCookie: string | null | undefined,
): Realm | undefined {
    return !isRealmApexHost(host) && isRealm(overrideCookie) ? overrideCookie : undefined;
}

/** The realm to treat a request as belonging to: the override if active, else the host's realm. */
export function effectiveRealm(host: string | null | undefined, overrideCookie: string | null | undefined): Realm {
    return realmOverride(host, overrideCookie) ?? realmForHost(host);
}

/**
 * Derives each realm's foreign locales: locales belonging to other realms
 * (their default plus any `extraLocales`, e.g. `sr-Latn` on serbia) that the
 * realm doesn't own itself (e.g. `fr` on opencouncil.gr). The proxy 301s their
 * URL prefixes to the unprefixed URL; `en` is shared by all realms, belongs to
 * none, and is never foreign.
 *
 * Filtered by locale rather than by realm: realms may share a default locale,
 * and a realm's own locales are never foreign on its host no matter which
 * other realm also uses them. Parameterized so that property stays testable
 * independent of the realms production defines; app code should use
 * `foreignLocalesForRealm`, which reads the result precomputed from `REALMS`
 * at module load — this runs in the proxy hot path, and the realm config being
 * static is what keeps per-request work at zero.
 */
export function computeForeignLocales<R extends string>(
    realms: Record<R, { defaultLocale: string; extraLocales?: readonly string[] }>,
): Record<R, string[]> {
    const ownLocales = (realm: { defaultLocale: string; extraLocales?: readonly string[] }) =>
        [realm.defaultLocale, ...(realm.extraLocales ?? [])];
    const allLocales = Object.values<{ defaultLocale: string; extraLocales?: readonly string[] }>(realms)
        .flatMap(ownLocales);
    const entries = (Object.keys(realms) as R[]).map((realm) => {
        const own = new Set(ownLocales(realms[realm]));
        return [realm, [...new Set(allLocales.filter((locale) => !own.has(locale)))]];
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

/**
 * Base URL for resolving a page's relative metadata URLs — today only the
 * `/api/og` images, since canonicals and hreflang are built absolute by
 * `buildCanonicalAlternates`.
 *
 * On a realm's production apex this is the canonical realm URL, so
 * opencouncil.gr and opencouncil.fr each unfurl their own images. On a preview
 * host it is the preview's own origin: resolving previews against the canonical
 * domain makes them unfurl *production's* renderer, so a change to an OG image
 * cannot be reviewed on the PR that makes it — the preview page keeps showing
 * whatever production draws.
 *
 * Only hosts under a realm domain earn that (`isKnownRealmHost`), so an
 * arbitrary `Host:` header can never steer a page's image URL to a domain we do
 * not own. Everything else (localhost, direct IP) keeps the canonical URL.
 */
export function metadataBaseForHost(host: string | null | undefined, realm: Realm): string {
    if (!isRealmApexHost(host) && isKnownRealmHost(host)) {
        return `https://${host!.toLowerCase()}`;
    }
    return getRealmBaseUrl(realm);
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

/**
 * ISO 3166-1 alpha-2 country code of a realm (uppercase), as the tasks backend
 * expects it on /summarize and /processAgenda to restrict geocoding of subject
 * locations. Derived from the realm rather than the city's language: `fr` spans
 * France/Belgium/Switzerland and `sr` spans Serbia/Bosnia/Montenegro, while a
 * realm is exactly one country.
 */
export function getRealmCountry(realm: Realm): Country {
    return REALMS[realm].country;
}

/** Fallback map center/zoom for a realm, used when a city has no stored geometry. */
export function getRealmDefaultMapView(realm: Realm): { center: [number, number]; zoom: number } {
    return REALM_DEFAULT_MAP_VIEW[realm];
}

/**
 * The phone number to show visitors of a realm, formatted for display. Serbia
 * has its own toll-free line; the rest share the Athens office number.
 */
export function getRealmContactPhone(realm: Realm): string {
    return REALMS[realm].contactPhone;
}

/**
 * `tel:` href for a display-formatted number — spacing removed, everything else
 * (the leading `+`, or a national trunk `0`) kept as written, because whether a
 * number is dialable internationally is a property of the number itself: the
 * Serbian toll-free line only works dialled domestically.
 */
export function telHref(phone: string): string {
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
