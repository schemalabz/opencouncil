import { isKnownRealmHost } from '@/lib/realm';

/**
 * Forwarded headers can be comma-separated lists when a request passes through
 * multiple proxies (e.g. `x-forwarded-host: opencouncil.fr, internal-lb`). The
 * client-facing value is the first entry.
 */
function firstHeaderValue(value: string | null): string | null {
    const first = value?.split(',')[0].trim();
    return first || null;
}

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
    const host =
        firstHeaderValue(request.headers.get('x-forwarded-host')) ??
        firstHeaderValue(request.headers.get('host'));

    if (!isKnownRealmHost(host)) return url;

    const target = new URL(url);
    // Fall back to the original URL's protocol when the platform doesn't set
    // x-forwarded-proto (e.g. local http dev), so the dev link is left intact.
    const proto =
        firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
        target.protocol.replace(/:$/, '');
    target.protocol = `${proto}:`;
    target.host = host as string;
    return target.toString();
}
