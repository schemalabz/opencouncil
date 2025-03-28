import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    images: {
        domains: ['townhalls-gr.fra1.digitaloceanspaces.com', 'data.opencouncil.gr', 'fra1.digitaloceanspaces.com'],
    },
    transpilePackages: ['@'],
    // Development optimizations
    swcMinify: true,
};

export default withNextIntl(nextConfig);

