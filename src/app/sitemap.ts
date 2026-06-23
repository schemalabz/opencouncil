import { MetadataRoute } from 'next'
import prisma from '@/lib/db/prisma'
import { Realm } from '@prisma/client'
import { REALMS } from '@/lib/realm'
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

// Each realm exposes its own default locale (unprefixed) plus English (`/en`).
// Alternates stay within the realm's own domain — cities exist in exactly one
// realm, so there is no cross-domain (`.gr`↔`.fr`) hreflang.
function buildAlternates(baseUrl: string, defaultLocale: string, path: string) {
    return {
        languages: {
            [defaultLocale]: `${baseUrl}${path}`,
            en: `${baseUrl}/en${path}`
        }
    }
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    if (process.env.SKIP_FULL_SITEMAP === 'true') {
        return []
    }

    // Resolve the realm and its canonical base from the request Host, so
    // opencouncil.gr and opencouncil.fr each emit their own realm's URLs.
    const realm = await getRealm()
    const baseUrl = await getRealmBaseUrlFromRequest()
    const defaultLocale = REALMS[realm].defaultLocale

    const cities = await fetchSitemapData(realm)

    const staticEntries: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            changeFrequency: 'daily',
            priority: 1,
            alternates: buildAlternates(baseUrl, defaultLocale, '')
        },
        {
            url: `${baseUrl}/about`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: buildAlternates(baseUrl, defaultLocale, '/about')
        },
        {
            url: `${baseUrl}/explain`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: buildAlternates(baseUrl, defaultLocale, '/explain')
        },
        {
            url: `${baseUrl}/corrections`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: buildAlternates(baseUrl, defaultLocale, '/corrections')
        }
    ]

    const cityEntries: MetadataRoute.Sitemap = cities.map(city => ({
        url: `${baseUrl}/${city.id}`,
        changeFrequency: 'daily',
        priority: 0.9,
        alternates: buildAlternates(baseUrl, defaultLocale, `/${city.id}`)
    }))

    const meetingEntries: MetadataRoute.Sitemap = cities.flatMap(city =>
        city.councilMeetings.map(meeting => ({
            url: `${baseUrl}/${city.id}/${meeting.id}`,
            changeFrequency: 'weekly',
            priority: 0.7,
            alternates: buildAlternates(baseUrl, defaultLocale, `/${city.id}/${meeting.id}`)
        }))
    )

    const subjectEntries: MetadataRoute.Sitemap = cities.flatMap(city =>
        city.councilMeetings.flatMap(meeting =>
            meeting.subjects.map(subject => ({
                url: `${baseUrl}/${city.id}/${meeting.id}/subjects/${subject.id}`,
                changeFrequency: 'weekly',
                priority: 0.6,
                alternates: buildAlternates(baseUrl, defaultLocale, `/${city.id}/${meeting.id}/subjects/${subject.id}`)
            }))
        )
    )

    return [...staticEntries, ...cityEntries, ...meetingEntries, ...subjectEntries]
}
