import { Realm } from '@prisma/client';
import type { Country } from '@/lib/apiTypes';

/**
 * The Athens office line — the number every realm shows unless it has one of its
 * own. Written the way it should be displayed; `telHref` derives the dialable form.
 */
const OFFICE_PHONE = '+30 211 198 0212';

/**
 * The locale that is never foreign on any realm's host. Every realm serves it,
 * and the realms without a catalog of their own make it their default.
 */
const SHARED_LOCALE = 'en';

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
/**
 * Where a realm stands commercially. `active` realms have paying municipalities:
 * the sales page quotes prices and shows the realm's own municipalities as
 * proof. `pending` realms are still looking for their first pilot: the sales
 * page asks for that pilot instead of quoting prices, and borrows the active
 * realms' municipalities as proof.
 */
export type RealmStage = 'active' | 'pending';

const REALM_DEFAULTS = {
    defaultLocale: SHARED_LOCALE,
    contactPhone: OFFICE_PHONE,
    stage: 'pending',
} as const;

export const REALMS = {
    greece: { ...REALM_DEFAULTS, domain: 'opencouncil.gr', defaultLocale: 'el', country: 'GR', stage: 'active' },
    france: { ...REALM_DEFAULTS, domain: 'opencouncil.fr', defaultLocale: 'fr', country: 'FR' },
    cyprus: { ...REALM_DEFAULTS, domain: 'opencouncil.cy', defaultLocale: 'el', country: 'CY' },
    // Serbian is digraphic: `sr` (Cyrillic) is the default, `sr-Latn` is the
    // realm-exclusive Latin variant reachable via the script switcher.
    // The Serbian number is a domestic toll-free line, so it is shown and
    // dialled in its national form rather than as +381.
    serbia: {
        ...REALM_DEFAULTS,
        domain: 'opencouncil.rs',
        defaultLocale: 'sr',
        extraLocales: ['sr-Latn'],
        country: 'RS',
        contactPhone: '0800 301167',
    },
    // These realms have no UI catalog in their own language yet, so they
    // serve the English one.
    austria: { ...REALM_DEFAULTS, domain: 'opencouncil.at', country: 'AT' },
    belgium: { ...REALM_DEFAULTS, domain: 'opencouncil.be', country: 'BE' },
    finland: { ...REALM_DEFAULTS, domain: 'opencouncil.fi', country: 'FI' },
    germany: { ...REALM_DEFAULTS, domain: 'opencouncil.de', country: 'DE' },
    italy: { ...REALM_DEFAULTS, domain: 'opencouncil.it', country: 'IT' },
    netherlands: { ...REALM_DEFAULTS, domain: 'opencouncil.nl', country: 'NL' },
    poland: { ...REALM_DEFAULTS, domain: 'opencouncil.pl', country: 'PL' },
    portugal: { ...REALM_DEFAULTS, domain: 'pt.opencouncil.eu', country: 'PT' },
    spain: { ...REALM_DEFAULTS, domain: 'opencouncil.es', country: 'ES' },
    bosnia: { ...REALM_DEFAULTS, domain: 'ba.opencouncil.eu', country: 'BA' },
    andorra: { ...REALM_DEFAULTS, domain: 'ad.opencouncil.eu', country: 'AD' },
    albania: { ...REALM_DEFAULTS, domain: 'al.opencouncil.eu', country: 'AL' },
    bulgaria: { ...REALM_DEFAULTS, domain: 'bg.opencouncil.eu', country: 'BG' },
    switzerland: { ...REALM_DEFAULTS, domain: 'ch.opencouncil.eu', country: 'CH' },
    czechia: { ...REALM_DEFAULTS, domain: 'cz.opencouncil.eu', country: 'CZ' },
    denmark: { ...REALM_DEFAULTS, domain: 'dk.opencouncil.eu', country: 'DK' },
    estonia: { ...REALM_DEFAULTS, domain: 'ee.opencouncil.eu', country: 'EE' },
    united_kingdom: { ...REALM_DEFAULTS, domain: 'gb.opencouncil.eu', country: 'GB' },
    croatia: { ...REALM_DEFAULTS, domain: 'hr.opencouncil.eu', country: 'HR' },
    hungary: { ...REALM_DEFAULTS, domain: 'hu.opencouncil.eu', country: 'HU' },
    ireland: { ...REALM_DEFAULTS, domain: 'ie.opencouncil.eu', country: 'IE' },
    iceland: { ...REALM_DEFAULTS, domain: 'is.opencouncil.eu', country: 'IS' },
    liechtenstein: { ...REALM_DEFAULTS, domain: 'li.opencouncil.eu', country: 'LI' },
    lithuania: { ...REALM_DEFAULTS, domain: 'lt.opencouncil.eu', country: 'LT' },
    luxembourg: { ...REALM_DEFAULTS, domain: 'lu.opencouncil.eu', country: 'LU' },
    latvia: { ...REALM_DEFAULTS, domain: 'lv.opencouncil.eu', country: 'LV' },
    monaco: { ...REALM_DEFAULTS, domain: 'mc.opencouncil.eu', country: 'MC' },
    moldova: { ...REALM_DEFAULTS, domain: 'md.opencouncil.eu', country: 'MD' },
    montenegro: { ...REALM_DEFAULTS, domain: 'me.opencouncil.eu', country: 'ME' },
    north_macedonia: { ...REALM_DEFAULTS, domain: 'mk.opencouncil.eu', country: 'MK' },
    malta: { ...REALM_DEFAULTS, domain: 'mt.opencouncil.eu', country: 'MT' },
    norway: { ...REALM_DEFAULTS, domain: 'no.opencouncil.eu', country: 'NO' },
    romania: { ...REALM_DEFAULTS, domain: 'ro.opencouncil.eu', country: 'RO' },
    sweden: { ...REALM_DEFAULTS, domain: 'se.opencouncil.eu', country: 'SE' },
    slovenia: { ...REALM_DEFAULTS, domain: 'si.opencouncil.eu', country: 'SI' },
    slovakia: { ...REALM_DEFAULTS, domain: 'sk.opencouncil.eu', country: 'SK' },
    san_marino: { ...REALM_DEFAULTS, domain: 'sm.opencouncil.eu', country: 'SM' },
    ukraine: { ...REALM_DEFAULTS, domain: 'ua.opencouncil.eu', country: 'UA' },
    kosovo: { ...REALM_DEFAULTS, domain: 'xk.opencouncil.eu', country: 'XK' },
} as const satisfies Record<
    Realm,
    {
        domain: string;
        defaultLocale: 'el' | 'fr' | 'sr' | typeof SHARED_LOCALE;
        country: Country;
        extraLocales?: readonly string[];
        contactPhone: string;
        stage: RealmStage;
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
    austria: { center: [13.33, 47.6], zoom: 6 },
    belgium: { center: [4.47, 50.5], zoom: 7 },
    finland: { center: [26.0, 64.0], zoom: 4 },
    germany: { center: [10.45, 51.16], zoom: 5 },
    italy: { center: [12.5, 42.5], zoom: 5 },
    netherlands: { center: [5.3, 52.2], zoom: 7 },
    poland: { center: [19.4, 52.1], zoom: 5 },
    portugal: { center: [-8.2, 39.6], zoom: 6 },     // mainland Portugal
    bosnia: { center: [17.8, 44.1], zoom: 7 },
    andorra: { center: [1.6, 42.5], zoom: 10 },
    albania: { center: [20.0, 41.2], zoom: 7 },
    bulgaria: { center: [25.5, 42.7], zoom: 6 },
    switzerland: { center: [8.2, 46.8], zoom: 7 },
    czechia: { center: [15.5, 49.8], zoom: 6 },
    denmark: { center: [10.0, 56.0], zoom: 6 },
    estonia: { center: [25.5, 58.6], zoom: 6 },
    united_kingdom: { center: [-3.0, 54.5], zoom: 5 },
    croatia: { center: [16.4, 45.1], zoom: 6 },
    hungary: { center: [19.5, 47.2], zoom: 6 },
    ireland: { center: [-8.0, 53.3], zoom: 6 },
    iceland: { center: [-19.0, 65.0], zoom: 5 },
    liechtenstein: { center: [9.55, 47.16], zoom: 11 },
    lithuania: { center: [24.0, 55.2], zoom: 6 },
    luxembourg: { center: [6.1, 49.8], zoom: 9 },
    latvia: { center: [24.6, 56.9], zoom: 6 },
    monaco: { center: [7.42, 43.74], zoom: 13 },
    moldova: { center: [28.4, 47.0], zoom: 7 },
    montenegro: { center: [19.3, 42.7], zoom: 8 },
    north_macedonia: { center: [21.7, 41.6], zoom: 7 },
    malta: { center: [14.4, 35.9], zoom: 10 },
    norway: { center: [12.0, 65.0], zoom: 4 },
    romania: { center: [25.0, 45.9], zoom: 6 },
    sweden: { center: [16.0, 63.0], zoom: 4 },
    slovenia: { center: [14.9, 46.1], zoom: 8 },
    slovakia: { center: [19.5, 48.7], zoom: 7 },
    san_marino: { center: [12.46, 43.94], zoom: 11 },
    ukraine: { center: [31.2, 49.0], zoom: 5 },
    kosovo: { center: [20.9, 42.6], zoom: 8 },
    spain: { center: [-3.7, 40.4], zoom: 5 },        // mainland Spain
};

const hostMatchesDomain = (host: string, domain: string): boolean =>
    host === domain || host.endsWith(`.${domain}`);

/**
 * The domain PR previews are served from: `pr-165.opencouncil.dev` for PR #165.
 *
 * It belongs to no realm — a preview resolves to `greece` like any other
 * unrecognised host, and reaches the other realms through `?realm=` (see
 * `REALM_OVERRIDE_COOKIE`). It is still one of our own hosts, so
 * `isKnownRealmHost` accepts it: the SEO redirects, the magic-link host rewrite
 * and the OG metadata base are gated on that check, and a preview that skipped
 * them would stop reproducing production.
 */
export const PREVIEW_DOMAIN = 'opencouncil.dev';

/**
 * Builds a resolver mapping a Host header value to a realm of `realms`, or null
 * when none matches. The port is stripped and the host lowercased so
 * `localhost:3000`-style hosts and a spoofed `Host: opencouncil.fr` both work;
 * each realm's domain matches as the apex or any subdomain (so
 * `www.opencouncil.fr` resolves to france, not to the default). Domains are
 * checked
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
 * Whether a Host header value is one of our own domains: a realm domain or
 * `PREVIEW_DOMAIN`, as the apex or any subdomain — so production and preview
 * hosts match, but `localhost` and any attacker-supplied host do not. Unlike
 * `realmForHost` (which defaults unknown hosts to `greece`), this is a strict
 * membership check — use it before trusting a request's Host for anything
 * sensitive, e.g. building a magic-link URL.
 */
export function isKnownRealmHost(host: string | null | undefined): boolean {
    const normalized = (host ?? '').split(':')[0].toLowerCase();
    if (!normalized) return false;
    // Reject anything that is not a bare hostname BEFORE matching the suffix.
    // `URL`'s `host` setter truncates at the first / ? # \, so a value like
    // `evil.example.com/x.opencouncil.gr` ends with a realm domain — passing a
    // plain suffix test — while the origin it produces is `evil.example.com`.
    // The allowlist would then approve a host it does not actually authorise.
    if (!/^[a-z0-9.-]+$/.test(normalized)) return false;
    if (hostMatchesDomain(normalized, PREVIEW_DOMAIN)) return true;
    return Object.values(REALMS).some(({ domain }) => hostMatchesDomain(normalized, domain));
}

/**
 * Cookie carrying a realm override on non-production hosts (see
 * `isRealmApexHost`). Set by the proxy when a request arrives with
 * `?realm=<realm>`; read by the proxy, `getRealm()` and `realmForBrowser()` so
 * previews and localhost can be viewed as any realm despite their Host
 * resolving elsewhere (preview hosts are subdomains of `PREVIEW_DOMAIN`, which
 * belongs to no realm).
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
 * (`opencouncil.gr`, not `pr-7.opencouncil.dev` or `localhost`). The realm
 * override is honored only on non-apex hosts: production domains must
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
 * URL prefixes to the unprefixed URL; `SHARED_LOCALE` (`en`) is never foreign,
 * even where a realm makes it its default.
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
        return [realm, [...new Set(allLocales.filter((locale) => !own.has(locale) && locale !== SHARED_LOCALE))]];
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
 * `withCanonicalUrl`.
 *
 * On a realm's production apex this is the canonical realm URL, so
 * opencouncil.gr and opencouncil.fr each unfurl their own images. On a preview
 * host it is the preview's own origin: resolving previews against the canonical
 * domain makes them unfurl *production's* renderer, so a change to an OG image
 * cannot be reviewed on the PR that makes it — the preview page keeps showing
 * whatever production draws.
 *
 * Only hosts we own earn that (`isKnownRealmHost`, which covers the realm
 * domains and `PREVIEW_DOMAIN`), so an arbitrary `Host:` header can never steer
 * a page's image URL to a domain we do not own. Everything else (localhost,
 * direct IP) keeps the canonical URL.
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

/** Whether a realm sells to paying municipalities yet, or is still after its first pilot. */
export function getRealmStage(realm: Realm): RealmStage {
    return REALMS[realm].stage;
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
