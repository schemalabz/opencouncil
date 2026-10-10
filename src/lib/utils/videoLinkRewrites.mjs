/**
 * Rewrites that let a reader paste a video link straight after the domain:
 * `opencouncil.gr/https://youtu.be/<id>?t=90` → the meeting transcript.
 *
 * Plain `.mjs` so that `next.config.mjs` (loaded by Node, no TypeScript) and
 * the tests share one definition. The rules live in the config and not in
 * `proxy.ts`, because the proxy matcher skips every path with a dot, and every
 * video link has one.
 *
 * A rule matches only when the first path segment is a video host, with or
 * without a scheme. City ids (`^[a-z-]+$`) and the app's own routes contain no
 * dot or colon, so they can never match. The router has already collapsed the
 * `//` after the scheme, so `https:` is a segment of its own.
 */

/** Hosts whose links `/yt/[...rest]` resolves. Keep in step with YOUTUBE_URL_REGEX. */
export const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];

/** The route that resolves a link to a meeting. */
export const VIDEO_LINK_ROUTE = '/yt';

const hostPattern = YOUTUBE_HOSTS.map(host => host.replaceAll('.', '\\.')).join('|');

/** @returns {{ source: string, destination: string }[]} */
export function videoLinkRewrites() {
    return [
        {
            source: `/:scheme(https?:)/:host(${hostPattern})/:path*`,
            destination: `${VIDEO_LINK_ROUTE}/:scheme/:host/:path*`,
        },
        {
            source: `/:host(${hostPattern})/:path*`,
            destination: `${VIDEO_LINK_ROUTE}/:host/:path*`,
        },
    ];
}
