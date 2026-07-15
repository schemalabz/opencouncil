import './src/env.mjs';
import createNextIntlPlugin from 'next-intl/plugin';
import { withPostHogConfig } from "@posthog/nextjs-config";

// Log which DB the build will use (host + db name only, no credentials)
try {
    const u = process.env.DATABASE_URL;
    if (u) {
        const { hostname, pathname } = new URL(u);
        console.log('[build] DATABASE_URL → host:', hostname, 'database:', pathname.slice(1) || '(default)');
    } else {
        console.log('[build] DATABASE_URL not set');
    }
} catch (_) {}

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    output: 'standalone',
    cacheHandler: process.env.NODE_ENV === 'production'
        ? new URL('./cache-handler.mjs', import.meta.url).pathname
        : undefined,
    cacheMaxMemorySize: process.env.NODE_ENV === 'production' ? 0 : undefined,
    // Deterministic build id (commit-based when available) so the Valkey cache
    // namespace distinguishes different code and is stable across the instances
    // of one deploy. Falls back to Next's default (random per build) otherwise.
    generateBuildId: async () => process.env.SOURCE_COMMIT || process.env.BUILD_ID || null,
    images: {
        domains: ['townhalls-gr.fra1.digitaloceanspaces.com', 'data.opencouncil.gr', 'fra1.digitaloceanspaces.com'],
    },
    transpilePackages: ['@'],
    // Enable custom domains - we'll handle this entirely in proxy.ts
    async headers() {
        return [
            {
                // Allow embed pages to be loaded in iframes on any domain
                source: '/:locale/embed/:path*',
                headers: [
                    { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
                    { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=3600' },
                ],
            },
            {
                // HTML pages vary by auth (per-user profile data, admin-only UI, the admin
                // dashboard itself), so they must NEVER be stored by a shared cache like
                // Cloudflare — doing so leaks one user's rendered page to another and can
                // serve cached admin HTML to anonymous visitors, bypassing the auth gate.
                // `private, no-store` keeps every HTML response per-request and also caps a
                // broken deploy, since the edge can't cache HTML at all.
                // Excludes _next/* (immutable hashed assets), api/*, files with extensions, and the embed rule above.
                source: '/((?!_next/|api/|[^/]*\\.[^/]*|[^/]+/embed/).*)',
                headers: [
                    { key: 'Cache-Control', value: 'private, no-store' },
                ],
            },
        ];
    },
    async redirects() {
        return [
            {
                source: '/petitions',
                destination: '/petition',
                permanent: true,
            },
            {
                // The standalone map page was removed in favour of the
                // map-based landing page. The old route was locale-
                // parameterized, so redirect both bare and locale-prefixed
                // forms.
                source: '/map',
                destination: '/',
                permanent: true,
            },
            {
                source: '/:locale(en|el|fr)/map',
                destination: '/:locale',
                permanent: true,
            },
            // The sitemap wrongly emitted a phantom /meetings/ segment until
            // 2026-05-29 (real routes are /{cityId}/{meetingId}, no /meetings/),
            // leaving ~1.9K GSC 404s that Google keeps recrawling. 301 them to
            // the real URLs. The (?!api/|en/|el/|fr/) lookahead keeps the real
            // /api/meetings/* routes (redirects run before middleware and the
            // filesystem) and defers prefixed variants to the locale rules.
            {
                source: '/:cityId((?!api/|en/|el/|fr/)[^/]+)/meetings/:meetingId/subjects/:subjectId',
                destination: '/:cityId/:meetingId/subjects/:subjectId',
                statusCode: 301,
            },
            {
                source: '/:cityId((?!api/|en/|el/|fr/)[^/]+)/meetings/:meetingId',
                destination: '/:cityId/:meetingId',
                statusCode: 301,
            },
            {
                source: '/:locale(en|el|fr)/:cityId/meetings/:meetingId/subjects/:subjectId',
                destination: '/:locale/:cityId/:meetingId/subjects/:subjectId',
                statusCode: 301,
            },
            {
                source: '/:locale(en|el|fr)/:cityId/meetings/:meetingId',
                destination: '/:locale/:cityId/:meetingId',
                statusCode: 301,
            },
        ];
    },
    async rewrites() {
        return [
            {
                source: "/ingest/static/:path*",
                destination: "https://eu-assets.i.posthog.com/static/:path*",
            },
            {
                source: "/ingest/array/:path*",
                destination: "https://eu-assets.i.posthog.com/array/:path*",
            },
            {
                source: "/ingest/:path*",
                destination: "https://eu.i.posthog.com/:path*",
            },
        ];
    },
    skipTrailingSlashRedirect: true,
    // Serve blocking (non-streamed) metadata to these crawlers, so notFound()
    // thrown in generateMetadata produces a real HTTP 404 instead of a streamed
    // 200 + noindex (GSC was reporting dead subject/meeting URLs as soft-404s).
    // Overriding replaces Next's default HTML_LIMITED_BOT_UA_RE, so this is the
    // default list copied wholesale with `Googlebot` prepended — plain Googlebot
    // is deliberately absent from Next's default because it executes JS, but a
    // streamed 404 still reaches it as HTTP 200.
    // Copied from next@16.2.6 (next/dist/shared/lib/router/utils/html-bots.js);
    // resync when upgrading Next in case upstream adds new crawlers.
    htmlLimitedBots: /Googlebot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i,
};

export default withPostHogConfig(withNextIntl(nextConfig), {
    personalApiKey: process.env.POSTHOG_API_KEY,
    projectId: process.env.POSTHOG_PROJECT_ID,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    sourcemaps: {
        // SKIP_ENV_VALIDATION=1 is set in Nix sandbox builds where network is blocked.
        // Disable there to prevent upload failures; production (DO App Platform) uses npm run build directly.
        // The plugin throws at config-load time if enabled without credentials, so also
        // require them to be present (contributors without a .env.local, deploys without the vars).
        enabled: !process.env.SKIP_ENV_VALIDATION
            && !!process.env.POSTHOG_API_KEY
            && !!process.env.POSTHOG_PROJECT_ID,
        deleteAfterUpload: true,
    },
});

