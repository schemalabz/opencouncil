import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    images: {
        domains: ['townhalls-gr.fra1.digitaloceanspaces.com', 'data.opencouncil.gr'],
    },
    transpilePackages: ['@'],
    basePath: process.env.BASE_PATH,

};

export default withNextIntl(nextConfig);

