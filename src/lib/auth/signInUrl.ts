import { isKnownRealmHost } from '@/lib/realm';
import { firstHeaderValue, hostFromRequest } from './requestHeaders';

/**
 * Repoints a magic-link URL at the host the sign-in request actually arrived on.
 *
 * Auth.js builds the URL from a single build-time base (`NEXTAUTH_URL`), so on a
 * multi-domain deployment (opencouncil.gr + opencouncil.fr) every magic link
 * points at the Greek domain. A French user then can't complete sign-in on
 * opencouncil.fr, because the callback would land on opencouncil.gr and set a
 * cookie there instead. Rewriting the origin to the request's own host fixes that;
 * the path and query string (the verification token and callbackUrl) are kept.
 *
 * SECURITY: only a host we recognise as one of our own domains is trusted. The
 * Host / X-Forwarded-Host headers are attacker-controllable if a request ever
 * reaches the origin directly or a proxy is misconfigured; since Auth.js email
 * tokens are keyed by email and not host-scoped, a magic link sent to an
 * attacker-controlled host would be enough to hijack the account. Unknown hosts
 * (incl. `localhost` dev) fall back to the original NEXTAUTH_URL-based link.
 *
 * Reads only the passed `request` (no `next/headers`), so it stays edge/middleware
 * bundle safe — `auth.config.ts` is reachable from `proxy.ts`.
 */
export function signInUrlForRequest(url: string, request: Request): string {
    const host = hostFromRequest(request);

    if (!isKnownRealmHost(host)) return url;

    const target = new URL(url);
    // Only an explicit `https` is taken from the forwarded header; anything else
    // keeps the original link's scheme. The header is as attacker-controllable as
    // the Host we allowlist above, and it decides whether a sign-in token travels
    // in cleartext — so it may upgrade the link, never downgrade it. Absent or
    // http (local dev) leaves the link exactly as Auth.js built it.
    const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto'));
    const proto = forwardedProto === 'https' ? 'https' : target.protocol.replace(/:$/, '');
    const originalOrigin = target.origin;
    target.protocol = `${proto}:`;
    target.host = host as string;

    // The post-verification destination rides along in the link as an absolute
    // URL: Auth.js resolves our relative `redirectTo` ("/profile") against
    // NEXTAUTH_URL's origin, not the request's. Repointing only the link itself
    // would verify the token on opencouncil.rs and then bounce the user to
    // opencouncil.gr/profile — signed out, since the session cookie was just set
    // on the other domain. Move the callback across with it.
    //
    // Origins are compared parsed, not by string prefix: `https://opencouncil.gr`
    // is a prefix of `https://opencouncil.gr.evil.com`, and splicing our host onto
    // that would rewrite a foreign URL into another foreign URL.
    const rawCallbackUrl = target.searchParams.get('callbackUrl');
    if (rawCallbackUrl) {
        try {
            const callback = new URL(rawCallbackUrl);
            if (callback.origin === originalOrigin) {
                callback.protocol = target.protocol;
                callback.host = target.host;
                target.searchParams.set('callbackUrl', callback.toString());
            }
        } catch {
            // relative (the pre-Auth.js form) or malformed — nothing to repoint
        }
    }

    return target.toString();
}
