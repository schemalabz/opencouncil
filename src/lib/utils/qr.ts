import { env } from '@/env.mjs';

export function isExternalUrl(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Build the final redirect URL for a QR campaign.
 *
 * Priority (highest → lowest):
 *   1. Params already on the destination URL (never overwritten)
 *   2. Incoming request query params (e.g. utm_content from per-poster QR codes)
 *   3. Defaults: utm_source=qr, utm_medium=offline, utm_campaign=<code>
 */
export function appendUtmParams(urlString: string, code: string, incomingParams: URLSearchParams): string {
    try {
        // For relative URLs, construct full URL using configured base URL
        const fullUrl = isExternalUrl(urlString)
            ? new URL(urlString)
            : new URL(urlString, env.NEXTAUTH_URL);

        // Forward query params from the incoming request (e.g. utm_content from per-poster QR codes).
        // Incoming params take priority over defaults but don't overwrite params on the destination URL.
        for (const [key, value] of incomingParams) {
            if (!fullUrl.searchParams.has(key)) {
                fullUrl.searchParams.set(key, value);
            }
        }

        // Set defaults for params not already provided by incoming request or destination URL
        if (!fullUrl.searchParams.has('utm_source')) fullUrl.searchParams.set('utm_source', 'qr');
        if (!fullUrl.searchParams.has('utm_medium')) fullUrl.searchParams.set('utm_medium', 'offline');
        if (!fullUrl.searchParams.has('utm_campaign')) fullUrl.searchParams.set('utm_campaign', code);

        // Always return full URL (NextResponse.redirect requires absolute URLs)
        return fullUrl.toString();
    } catch {
        return urlString;
    }
}
