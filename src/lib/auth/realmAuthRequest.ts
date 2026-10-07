import { isRealmApexHost } from '@/lib/realm';
import { firstHeaderValue, hostFromHeaders } from './requestHeaders';
import { isBaseUrlHost, retargetUrl } from './requestUrl';

/** The Auth.js routes that run on the realm's own host: Google's sign-in and its callback. */
const REALM_OAUTH_PATH = /^\/api\/auth\/(signin|callback)\/google$/;

/**
 * The URL an Auth.js request must carry to run on the realm it arrived on,
 * or null to leave it to next-auth's handler.
 *
 * next-auth rewrites every request to the origin of NEXTAUTH_URL
 * (`reqWithEnvURL`), and one deployment serves every realm. A Google sign-in
 * started on opencouncil.rs would then ask Google to return to
 * opencouncil.gr, where neither its state cookies nor its session belong.
 * For the Google routes on another realm's apex, the request keeps its own
 * host, and the route hands it to Auth.js core, which takes the URL as given.
 *
 * Only an exact realm apex qualifies (`isRealmApexHost`): the forwarded host
 * is as attacker-controllable as Host, and no other host may ever become the
 * callback address. The deployment's own host and every other Auth.js route
 * stay on next-auth's path. The move itself is `retargetUrl`, shared with
 * the magic link: a forwarded `https` may upgrade the URL, nothing
 * downgrades it.
 *
 * Pure, so it is testable without the env module.
 */
export function realmOAuthUrl(url: string, headers: Headers, baseUrl: string): string | null {
    const target = new URL(url);
    if (!REALM_OAUTH_PATH.test(target.pathname)) return null;

    const host = hostFromHeaders(headers);
    if (!host || !isRealmApexHost(host) || isBaseUrlHost(host, baseUrl)) return null;

    return retargetUrl(target, host, firstHeaderValue(headers.get('x-forwarded-proto'))).toString();
}
