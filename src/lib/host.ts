// The French production domain (apex + any subdomain). Scoped to opencouncil.fr
// rather than a bare `.fr` suffix so an unrelated `*.fr` host (staging, internal
// tooling, a typo'd preview) can't accidentally be treated as the French realm.
export const FRENCH_DOMAIN = 'opencouncil.fr';

/**
 * Whether a `Host` header value belongs to the French domain (`opencouncil.fr`
 * or a subdomain of it). The port is stripped so `localhost`-style `host:port`
 * and real domains both work, and a spoofed `Host: opencouncil.fr` header can be
 * used to test locally.
 */
export function isFrenchDomainHost(hostHeader: string | null | undefined): boolean {
    const host = (hostHeader ?? '').split(':')[0].toLowerCase();
    return host === FRENCH_DOMAIN || host.endsWith(`.${FRENCH_DOMAIN}`);
}
