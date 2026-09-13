import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getRealmBaseUrlFromRequest } from '@/lib/realm.server'

// Dynamic per realm: each domain advertises its own sitemap and canonical host,
// resolved from the request Host (opencouncil.gr vs opencouncil.fr). Forced
// dynamic so it isn't statically generated at build time (no Host → greece).
export const dynamic = 'force-dynamic'

/** A PR preview (pr-N.opencouncil.dev) is public but not for crawlers: every page they open costs work the site never asked for, such as illustration generation. */
const PREVIEW_HOST = /^pr-\d+\./

export default async function robots(): Promise<MetadataRoute.Robots> {
    const host = (await headers()).get('host') ?? ''
    if (PREVIEW_HOST.test(host)) {
        return { rules: { userAgent: '*', disallow: '/' } }
    }
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
