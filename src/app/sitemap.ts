import { MetadataRoute } from 'next'
import prisma from '@/lib/db/prisma'
import { Realm } from '@prisma/client'
import { getRealm, getRealmBaseUrlFromRequest } from '@/lib/realm.server'
import { hasExplainPage } from '@/lib/explain/availability'
import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';

// Resolves the realm from the request Host, so it must render per request rather
// than being statically generated at build time (where no Host is available and
// realmForHost would fall back to greece, serving Greek URLs on .fr).
export const dynamic = 'force-dynamic'

type SitemapCity = {
    id: string
    updatedAt: Date
    councilMeetings: Array<{
        id: string
        updatedAt: Date
        subjects: Array<{ id: string; updatedAt: Date }>
    }>
}

function latestDate(first: Date, ...rest: Date[]): Date {
    return rest.reduce((max, date) => (date > max ? date : max), first)
}

async function fetchSitemapData(realm: Realm): Promise<SitemapCity[]> {
    return prisma.city.findMany({
        where: {
            ...PUBLIC_CITY_WHERE,
            realm,
        },
        select: {
            id: true,
            updatedAt: true,
            councilMeetings: {
                where: { released: true },
                select: {
                    id: true,
                    updatedAt: true,
                    subjects: {
                        select: { id: true, updatedAt: true }
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
        // /explain exists only on the Greek realm, and a sitemap is the one entry
        // point no human checks — .fr and .rs were advertising a URL that 404s.
        ...(hasExplainPage(realm)
            ? [{
                url: `${baseUrl}/explain`,
                changeFrequency: 'weekly' as const,
                priority: 0.8,
            }]
            : []),
        {
            url: `${baseUrl}/corrections`,
            changeFrequency: 'weekly',
            priority: 0.8,
        }
    ]

    const cityEntries: MetadataRoute.Sitemap = cities.map(city => ({
        url: `${baseUrl}/${city.id}`,
        lastModified: latestDate(city.updatedAt, ...city.councilMeetings.map(meeting => meeting.updatedAt)),
        changeFrequency: 'daily',
        priority: 0.9,
    }))

    const meetingEntries: MetadataRoute.Sitemap = cities.flatMap(city =>
        city.councilMeetings.map(meeting => ({
            url: `${baseUrl}/${city.id}/${meeting.id}`,
            lastModified: latestDate(meeting.updatedAt, ...meeting.subjects.map(subject => subject.updatedAt)),
            changeFrequency: 'weekly',
            priority: 0.7,
        }))
    )

    const subjectEntries: MetadataRoute.Sitemap = cities.flatMap(city =>
        city.councilMeetings.flatMap(meeting =>
            meeting.subjects.map(subject => ({
                url: `${baseUrl}/${city.id}/${meeting.id}/subjects/${subject.id}`,
                lastModified: subject.updatedAt,
                changeFrequency: 'weekly',
                priority: 0.6,
            }))
        )
    )

    return [...staticEntries, ...cityEntries, ...meetingEntries, ...subjectEntries]
}
