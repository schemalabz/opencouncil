import { NextRequest } from 'next/server';
import { env } from '@/env.mjs';

/**
 * The session-mirror cookie for the Notis admin (see the design note in
 * src/proxy.ts). One module owns every cookie-name convention and the mirror
 * cookie's construction, shared by the proxy (edge) and the Auth.js route
 * wrapper (node) — Web Crypto only, so both runtimes work.
 *
 * The mirror carries a SHA-256 of the session token, never the token itself:
 * subdomain hosts (data.opencouncil.gr, previews) receive a value that cannot
 * be replayed against opencouncil.gr, and Notis validates it against the
 * hashed column of notis_admin_sessions.
 */

/** The Auth.js session cookie name on https deployments (Auth.js default). */
export const PROD_SESSION_COOKIE = '__Secure-authjs.session-token';

/** The port-suffixed dev session cookie name (see src/auth.config.ts). */
export function devSessionCookieName(port: string): string {
    return `authjs.session-token-${port}`;
}

export function mirrorCookieName(): string {
    return `__Secure-oc-session${env.SESSION_COOKIE_SUFFIX ?? ''}`;
}

export async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function mirrorSetCookie(value: string, domain: string, maxAge: number): string {
    return `${mirrorCookieName()}=${value}; Domain=${domain}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/** The host that actually holds the session cookie: the one NEXTAUTH_URL
 *  names. The Auth.js cookie is host-only, so no other host under the apex
 *  can see it — which is why only this host may read its absence as a
 *  sign-out. */
export function isSessionHost(host: string | null): boolean {
    const hostname = host?.split(':')[0] ?? '';
    try {
        return hostname === new URL(env.NEXTAUTH_URL).hostname;
    } catch {
        return false;
    }
}

/** Whether mirroring applies: a domain is configured and the host is under it. */
export function mirrorDomainForHost(host: string | null): string | null {
    const domain = env.SESSION_COOKIE_DOMAIN;
    if (!domain) return null;
    const bare = domain.replace(/^\./, '');
    const hostname = host?.split(':')[0] ?? '';
    if (hostname !== bare && !hostname.endsWith(`.${bare}`)) return null;
    return domain;
}

/**
 * Proxy-side mirror maintenance: keep the mirror in sync with the session
 * cookie on page navigations. This is the refresher for sessions that predate
 * a deploy and the janitor for logouts that raced the auth-route path; the
 * authoritative set/clear happens in withSessionMirror below, on the response
 * that writes the session cookie itself.
 */
export async function applySessionMirror(
    req: NextRequest,
    res: Response | undefined,
): Promise<Response | undefined> {
    // The auth() fallthrough can yield undefined (= continue unmodified).
    if (!res) return res;
    const domain = mirrorDomainForHost(req.headers.get('host'));
    if (!domain) return res;

    const token = req.cookies.get(PROD_SESSION_COOKIE)?.value;
    const current = req.cookies.get(mirrorCookieName())?.value;

    if (token) {
        const hash = await sha256Hex(token);
        if (current !== hash) {
            res.headers.append('Set-Cookie', mirrorSetCookie(hash, domain, 2_592_000));
        }
    } else if (current && isSessionHost(req.headers.get('host'))) {
        // Only the session host may clear the mirror. Everywhere else under
        // the apex — www, data, a preview — the session cookie is absent by
        // construction, so clearing on its absence would sign the admin out
        // of Notis for the whole domain on any page view there.
        res.headers.append('Set-Cookie', mirrorSetCookie('', domain, 0));
    }
    return res;
}

/**
 * Auth-route wrapper: whenever an Auth.js response sets or clears the session
 * cookie (magic-link callback, sign-out), set or clear the mirror on the SAME
 * response. This is what makes the sign-in round-trip to notis work first
 * time — the callback 302s straight to notis.opencouncil.gr, so the mirror
 * must ride that very response.
 */
export function withSessionMirror(
    handler: (req: NextRequest) => Promise<Response>,
): (req: NextRequest) => Promise<Response> {
    return async (req) => {
        const res = await handler(req);
        const domain = mirrorDomainForHost(req.headers.get('host'));
        if (!domain) return res;

        for (const cookie of res.headers.getSetCookie()) {
            if (!cookie.startsWith(`${PROD_SESSION_COOKIE}=`)) continue;
            const value = cookie.slice(PROD_SESSION_COOKIE.length + 1).split(';')[0];
            if (value) {
                res.headers.append(
                    'Set-Cookie',
                    mirrorSetCookie(await sha256Hex(decodeURIComponent(value)), domain, 2_592_000),
                );
            } else {
                res.headers.append('Set-Cookie', mirrorSetCookie('', domain, 0));
            }
        }
        return res;
    };
}
