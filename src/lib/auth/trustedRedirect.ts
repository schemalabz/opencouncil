import { isRealmApexHost } from "@/lib/realm";

// The Notis admin (notis.opencouncil.gr) authenticates with the main app's
// session, so sign-in must be able to round-trip back to it. Explicit hosts
// only — a wildcard over *.opencouncil.gr would let data.opencouncil.gr
// (attacker-uploadable Spaces content) become an open-redirect target.
const NOTIS_HOSTS = new Set(["notis.opencouncil.gr", "notis.staging.opencouncil.gr"]);

// Paired PR previews (flake.nix wires notis-pr-N to talk to pr-N, session
// mirror included), so their sign-in round-trip must land back on notis.
// Anchored to the exact pattern — preview hosts run our own deployed code,
// unlike the user-content subdomains the comment above excludes.
const NOTIS_PREVIEW_HOST = /^notis-pr-\d+\.opencouncil\.dev$/;

/**
 * Whether an absolute URL is a trusted cross-origin target for a post-auth
 * redirect: our realm apexes and the Notis admin hosts over https, plus any
 * localhost port in development (the Notis dev server runs on :3001).
 */
export function isTrustedExternalRedirect(url: string): boolean {
    try {
        const { protocol, host } = new URL(url);
        if (
            protocol === "https:" &&
            (isRealmApexHost(host) || NOTIS_HOSTS.has(host) || NOTIS_PREVIEW_HOST.test(host))
        ) {
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
