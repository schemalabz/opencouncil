import './src/env.mjs';
import createNextIntlPlugin from 'next-intl/plugin';

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
};

export default withNextIntl(nextConfig);

