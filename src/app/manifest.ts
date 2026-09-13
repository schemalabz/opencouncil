import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { REALMS } from '@/lib/realm';
import { getRealm } from '@/lib/realm.server';

// Dynamic per realm, like robots.ts: the description and language follow the
// realm's default locale, and `start_url` is relative so the installed app
// opens on the domain it was installed from. Icons come from
// scripts/generate-pwa-icons.ts.
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
    const realm = await getRealm();
    const locale = REALMS[realm].defaultLocale;
    const t = await getTranslations({ locale, namespace: 'pwa.manifest' });
    // The request host, not the realm's canonical domain: a preview installs
    // from its own host, and `getInstalledRelatedApps` only matches a URL on
    // the origin the app was installed from.
    const host = (await headers()).get('host') ?? REALMS[realm].domain;

    return {
        id: '/',
        name: 'OpenCouncil',
        short_name: 'OpenCouncil',
        description: t('description'),
        lang: locale,
        // The query names the launcher as the source in analytics; `id`
        // above keeps the installed app's identity independent of it.
        start_url: '/?utm_source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        categories: ['government', 'news'],
        // Lets `navigator.getInstalledRelatedApps()` (Chromium) report the
        // site itself as installed, so the install entry can hide.
        related_applications: [{ platform: 'webapp', url: `https://${host}/manifest.webmanifest` }],
        prefer_related_applications: false,
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
