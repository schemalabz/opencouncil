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
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[build] Failed to parse DATABASE_URL from env.DATABASE_URL:', message);
}

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    output: 'standalone',
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'townhalls-gr.fra1.digitaloceanspaces.com', pathname: '/city-logos/**' },
            { protocol: 'https', hostname: 'townhalls-gr.fra1.digitaloceanspaces.com', pathname: '/party-logos/**' },
            { protocol: 'https', hostname: 'townhalls-gr.fra1.digitaloceanspaces.com', pathname: '/person-images/**' },
            { protocol: 'https', hostname: 'townhalls-gr.fra1.digitaloceanspaces.com', pathname: '/uploads/**' },
            { protocol: 'https', hostname: 'data.opencouncil.gr', pathname: '/city-logos/**' },
            { protocol: 'https', hostname: 'data.opencouncil.gr', pathname: '/party-logos/**' },
            { protocol: 'https', hostname: 'data.opencouncil.gr', pathname: '/person-images/**' },
            { protocol: 'https', hostname: 'data.opencouncil.gr', pathname: '/uploads/**' },
            { protocol: 'https', hostname: 'fra1.digitaloceanspaces.com', pathname: '/townhalls-gr/city-logos/**' },
            { protocol: 'https', hostname: 'fra1.digitaloceanspaces.com', pathname: '/townhalls-gr/party-logos/**' },
            { protocol: 'https', hostname: 'fra1.digitaloceanspaces.com', pathname: '/townhalls-gr/person-images/**' },
            { protocol: 'https', hostname: 'fra1.digitaloceanspaces.com', pathname: '/townhalls-gr/uploads/**' },
        ],
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
