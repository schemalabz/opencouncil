import { NextResponse } from 'next/server';

/**
 * A redirect with a relative Location, so the browser resolves it against
 * the origin it is already on.
 *
 * No absolute base is correct in a route handler that a scan or a shared
 * link reaches: one deployment serves every realm domain, so `NEXTAUTH_URL`
 * names one realm only, and `request.url` resolves to the server's bind
 * address behind the reverse proxy (0.0.0.0:PORT on previews). Relative, the
 * response stays on the realm printed on the sheet or on the link.
 *
 * `NextResponse.redirect` refuses a relative URL, hence the raw header.
 */
export function relativeRedirect(pathname: string, params?: URLSearchParams, status: 302 | 307 = 302): NextResponse {
    const search = params?.toString();
    return new NextResponse(null, {
        status,
        headers: { Location: search ? `${pathname}?${search}` : pathname },
    });
}
