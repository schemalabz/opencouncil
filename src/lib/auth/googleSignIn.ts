import { env } from '@/env.mjs';
import { isRealmApexHost } from '@/lib/realm';
import { hostFromHeaders } from './requestHeaders';
import { isBaseUrlHost } from './requestUrl';

/** Whether the Google client is configured. The provider registers only then. */
export function googleSignInConfigured(): boolean {
    return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

/**
 * Whether the Google button works for a request on `host`, given the
 * deployment's base URL. It works on the host the base URL names, where
 * next-auth builds the OAuth redirect_uri, and on every realm apex, where the
 * auth route keeps Google on the realm's own host (see realmOAuthUrl). Any
 * other host (a preview under another name, a subdomain) could not finish
 * the sign-in. The port is part of the comparison: in development the
 * session cookie is per port.
 *
 * Pure, so it is testable without the env module.
 */
export function googleSignInAvailableFor(host: string | null, baseUrl: string, configured: boolean): boolean {
    if (!configured || !host) return false;
    return isRealmApexHost(host) || isBaseUrlHost(host, baseUrl);
}

/** `googleSignInAvailableFor` for this deployment and the request these headers came with. */
export function googleSignInAvailable(headers: Headers): boolean {
    return googleSignInAvailableFor(hostFromHeaders(headers), env.NEXTAUTH_URL, googleSignInConfigured());
}
