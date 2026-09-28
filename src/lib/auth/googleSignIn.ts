import { env } from '@/env.mjs';
import { hostFromHeaders } from './requestHeaders';

/** Whether the Google client is configured. The provider registers only then. */
export function googleSignInConfigured(): boolean {
    return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

/**
 * Whether the Google button works for a request on `host`, given the
 * deployment's base URL. Auth.js builds the OAuth redirect_uri from that base
 * URL and sets the state cookie on the request host, so a sign-in that starts
 * on any other host (opencouncil.rs, a preview) cannot finish. The port is
 * part of the comparison: in development the session cookie is per port.
 *
 * Pure, so it is testable without the env module.
 */
export function googleSignInAvailableFor(host: string | null, baseUrl: string, configured: boolean): boolean {
    if (!configured || !host) return false;
    try {
        return host.toLowerCase() === new URL(baseUrl).host.toLowerCase();
    } catch {
        return false;
    }
}

/** `googleSignInAvailableFor` for this deployment and the request these headers came with. */
export function googleSignInAvailable(headers: Headers): boolean {
    return googleSignInAvailableFor(hostFromHeaders(headers), env.NEXTAUTH_URL, googleSignInConfigured());
}
