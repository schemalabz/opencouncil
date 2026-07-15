import { MetadataRoute } from 'next'
import prisma from '@/lib/db/prisma'
import { Realm } from '@prisma/client'
import { getRealm, getRealmBaseUrlFromRequest } from '@/lib/realm.server'

// Resolves the realm from the request Host, so it must render per request rather
// than being statically generated at build time (where no Host is available and
// realmForHost would fall back to greece, serving Greek URLs on .fr).
export const dynamic = 'force-dynamic'

type SitemapCity = {
    id: string
    councilMeetings: Array<{
        id: string
        subjects: Array<{ id: string }>
    }>
}

async function fetchSitemapData(realm: Realm): Promise<SitemapCity[]> {
    return prisma.city.findMany({
        where: {
            status: 'listed',
            realm,
        },
        select: {
            id: true,
            councilMeetings: {
                where: { released: true },
                select: {
                    id: true,
                    subjects: {
                        select: { id: true }
                    }
                }
            }
        }
    })
}

// Only the default-locale (unprefixed) URLs are advertised: /en variants are
// intentionally deindexed (they canonicalize to the default-locale URL), so no
// hreflang alternates are emitted.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    if (process.env.SKIP_FULL_SITEMAP === 'true') {
        return []
    }

    // Resolve the realm and its canonical base from the request Host, so
    // opencouncil.gr and opencouncil.fr each emit their own realm's URLs.
    const realm = await getRealm()
    const baseUrl = await getRealmBaseUrlFromRequest()

    const cities = await fetchSitemapData(realm)

    const staticEntries: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${baseUrl}/about`,
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/explain`,
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/corrections`,
            changeFrequency: 'weekly',
            priority: 0.8,
        }
    ]

    const cityEntries: MetadataRoute.Sitemap = cities.map(city => ({
        url: `${baseUrl}/${city.id}`,
        changeFrequency: 'daily',
        priority: 0.9,
    }))

    const meetingEntries: MetadataRoute.Sitemap = cities.flatMap(city =>
        city.councilMeetings.map(meeting => ({
            url: `${baseUrl}/${city.id}/${meeting.id}`,
            changeFrequency: 'weekly',
            priority: 0.7,
        }))
    )

    const subjectEntries: MetadataRoute.Sitemap = cities.flatMap(city =>
        city.councilMeetings.flatMap(meeting =>
            meeting.subjects.map(subject => ({
                url: `${baseUrl}/${city.id}/${meeting.id}/subjects/${subject.id}`,
                changeFrequency: 'weekly',
                priority: 0.6,
            }))
        )
    )

    return [...staticEntries, ...cityEntries, ...meetingEntries, ...subjectEntries]
}
