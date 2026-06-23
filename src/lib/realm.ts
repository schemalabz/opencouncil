import { Realm } from '@prisma/client';

/**
 * Realm (tenant) configuration. A single deployment serves both domains off one
 * database; the realm a request belongs to is resolved from its Host header (see
 * `realmForHost`). This is the single source of truth mapping each realm to its
 * canonical production domain and default UI locale.
 *
 * Pure module — no `next/headers`/server-only imports — so it is safe to use from
 * client components (the footer country-switcher) and the edge/middleware bundle
 * (`proxy.ts`). The request-scoped resolver lives in `realm.server.ts`.
 */
export const REALMS = {
    greece: { domain: 'opencouncil.gr', defaultLocale: 'el' },
    france: { domain: 'opencouncil.fr', defaultLocale: 'fr' },
} as const satisfies Record<Realm, { domain: string; defaultLocale: 'el' | 'fr' }>;

/**
 * Resolves the realm for a Host header value. The port is stripped and the host
 * lowercased so `localhost:3000`-style hosts and a spoofed `Host: opencouncil.fr`
 * both work; each realm's domain matches as the apex or any subdomain (so preview
 * hosts like `pr-7.preview.opencouncil.fr` resolve correctly). Defaults to
 * `greece` for unknown hosts (localhost, the Greek production domain).
 */
const hostMatchesDomain = (host: string, domain: string): boolean =>
    host === domain || host.endsWith(`.${domain}`);

export function realmForHost(host: string | null | undefined): Realm {
    const normalized = (host ?? '').split(':')[0].toLowerCase();
    for (const [realm, { domain }] of Object.entries(REALMS)) {
        if (hostMatchesDomain(normalized, domain)) {
            return realm as Realm;
        }
    }
    return 'greece';
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
 * Canonical absolute base URL for a realm (e.g. `https://opencouncil.fr`). Used
 * for SEO metadata, sitemaps, hreflang/canonical links and the footer switcher's
 * cross-domain redirect.
 */
export function getRealmBaseUrl(realm: Realm): string {
    return `https://${REALMS[realm].domain}`;
}
