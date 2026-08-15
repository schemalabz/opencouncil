import { isRealmApexHost } from "@/lib/realm";

// The Notis admin (notis.opencouncil.gr) authenticates with the main app's
// session, so sign-in must be able to round-trip back to it. Explicit hosts
// only — a wildcard over *.opencouncil.gr would let data.opencouncil.gr
// (attacker-uploadable Spaces content) become an open-redirect target.
const NOTIS_HOSTS = new Set(["notis.opencouncil.gr", "notis.staging.opencouncil.gr"]);

/**
 * Whether an absolute URL is a trusted cross-origin target for a post-auth
 * redirect: our realm apexes and the Notis admin hosts over https, plus any
 * localhost port in development (the Notis dev server runs on :3001).
 */
export function isTrustedExternalRedirect(url: string): boolean {
    try {
        const { protocol, host } = new URL(url);
        if (protocol === "https:" && (isRealmApexHost(host) || NOTIS_HOSTS.has(host))) {
            return true;
        }
        if (process.env.NODE_ENV === "development" && protocol === "http:" && /^localhost:\d+$/.test(host)) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}
