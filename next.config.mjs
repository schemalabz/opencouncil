import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['townhalls-gr.fra1.digitaloceanspaces.com'],
    },
    transpilePackages: ['@']
};

export default withNextIntl(nextConfig);

