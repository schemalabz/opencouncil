/**
 * Readers for the raw `Request` that Auth.js hands to its provider callbacks.
 *
 * Auth.js passes a plain `Request`, not a `NextRequest`, so there is no
 * `.cookies` and no normalized host — and these run inside `auth.config.ts`,
 * which `proxy.ts` pulls into the middleware bundle, so nothing here may import
 * `next/headers` or anything server-only.
 */

/**
 * Forwarded headers can be comma-separated lists when a request passes through
 * multiple proxies (e.g. `x-forwarded-host: opencouncil.fr, internal-lb`). The
 * client-facing value is the first entry.
 */
export function firstHeaderValue(value: string | null): string | null {
    const first = value?.split(',')[0].trim();
    return first || null;
}

/** The host the request arrived on, preferring the proxy's forwarded value. */
export function hostFromRequest(request: Request): string | null {
    return (
        firstHeaderValue(request.headers.get('x-forwarded-host')) ??
        firstHeaderValue(request.headers.get('host'))
    );
}

/**
 * One cookie's raw value from the `Cookie` header, or undefined.
 *
 * Deliberately not percent-decoded: every cookie read here holds a plain token
 * (`serbia`, `latn`) compared against a known set, and `decodeURIComponent`
 * throws on malformed input — which, on an attacker-supplied header, would
 * abort the sign-in email instead of just failing to match.
 */
export function readCookie(request: Request, name: string): string | undefined {
    const header = request.headers.get('cookie');
    if (!header) return undefined;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === name) {
            return part.slice(eq + 1).trim();
        }
    }
    return undefined;
}
