import { MetadataRoute } from 'next'
import prisma from '@/lib/db/prisma'
import { env } from '@/env.mjs'

const baseUrl = env.NEXTAUTH_URL

type SitemapCity = {
    id: string
    councilMeetings: Array<{
        id: string
        subjects: Array<{ id: string }>
    }>
}

function buildAlternates(path: string) {
    return {
        languages: {
            el: `${baseUrl}${path}`,
            en: `${baseUrl}/en${path}`
        }
    }
}

async function fetchSitemapData(): Promise<SitemapCity[]> {
    return prisma.city.findMany({
        where: {
            status: 'listed',
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
    if (!baseUrl || process.env.SKIP_FULL_SITEMAP === 'true') {
        return []
    }

    const cities = await fetchSitemapData()

    const staticEntries: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            changeFrequency: 'daily',
            priority: 1,
            alternates: buildAlternates('')
        },
        {
            url: `${baseUrl}/about`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: buildAlternates('/about')
        },
        {
            url: `${baseUrl}/explain`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: buildAlternates('/explain')
        },
        {
            url: `${baseUrl}/corrections`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: buildAlternates('/corrections')
        }
    ]

    const cityEntries: MetadataRoute.Sitemap = cities.map(city => ({
        url: `${baseUrl}/${city.id}`,
        changeFrequency: 'daily',
        priority: 0.9,
        alternates: buildAlternates(`/${city.id}`)
    }))

    const meetingEntries: MetadataRoute.Sitemap = cities.flatMap(city =>
        city.councilMeetings.map(meeting => ({
            url: `${baseUrl}/${city.id}/meetings/${meeting.id}`,
            changeFrequency: 'weekly',
            priority: 0.7,
            alternates: buildAlternates(`/${city.id}/meetings/${meeting.id}`)
        }))
    )

    const subjectEntries: MetadataRoute.Sitemap = cities.flatMap(city =>
        city.councilMeetings.flatMap(meeting =>
            meeting.subjects.map(subject => ({
                url: `${baseUrl}/${city.id}/meetings/${meeting.id}/subjects/${subject.id}`,
                changeFrequency: 'weekly',
                priority: 0.6,
                alternates: buildAlternates(`/${city.id}/meetings/${meeting.id}/subjects/${subject.id}`)
            }))
        )
    )

    return [...staticEntries, ...cityEntries, ...meetingEntries, ...subjectEntries]
}