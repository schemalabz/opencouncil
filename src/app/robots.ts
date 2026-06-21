import { MetadataRoute } from 'next'
import { getRealmBaseUrlFromRequest } from '@/lib/realm.server'

// Dynamic per realm: each domain advertises its own sitemap and canonical host,
// resolved from the request Host (opencouncil.gr vs opencouncil.fr). Forced
// dynamic so it isn't statically generated at build time (no Host → greece).
export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
    const baseUrl = await getRealmBaseUrlFromRequest()

    return {
        rules: {
            userAgent: '*',
            allow: '/',
            // Raw transcript pages are surfaced via subject pages; don't index them.
            disallow: '/*/*/transcript',
        },
        sitemap: `${baseUrl}/sitemap.xml`,
        host: baseUrl,
    }
}
