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
    images: {
        domains: ['townhalls-gr.fra1.digitaloceanspaces.com', 'data.opencouncil.gr', 'fra1.digitaloceanspaces.com'],
    },
    transpilePackages: ['@'],
    // Development optimizations
    swcMinify: true,
    // Enable custom domains - we'll handle this entirely in middleware
    // Removing the invalid rewrite configuration
    async redirects() {
        return [
            {
                source: '/petitions',
                destination: '/petition',
                permanent: true,
            },
        ];
    },
};

export default withNextIntl(nextConfig);

