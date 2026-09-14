import { MetadataRoute } from 'next';
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
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
