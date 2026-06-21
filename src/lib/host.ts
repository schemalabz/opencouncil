import { REALMS, realmForHost } from './realm';

// The French production domain (apex + any subdomain). Re-exported from the
// shared realm config so there is a single literal for the domain.
export const FRENCH_DOMAIN = REALMS.france.domain;

/**
 * Whether a `Host` header value belongs to the French domain (`opencouncil.fr`
 * or a subdomain of it). Thin wrapper over the shared `realmForHost` mapping (the
 * single source of truth for host→realm) so host-parsing isn't duplicated.
 */
export function isFrenchDomainHost(hostHeader: string | null | undefined): boolean {
    return realmForHost(hostHeader) === 'france';
}
