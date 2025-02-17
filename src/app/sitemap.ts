import { MetadataRoute } from 'next'
import { getCities } from '@/lib/db/cities'
import { getSubjectsForMeeting } from '@/lib/db/subject'

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://opencouncil.gr'

// Static sitemap for non-dynamic routes
export async function generateStaticSitemap(): Promise<MetadataRoute.Sitemap> {
    return [
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
        },
    ]
}

// Cities sitemap
export async function generateCitiesSitemap(): Promise<MetadataRoute.Sitemap> {
    const cities = await getCities()
    return cities.map(city => ({
        url: `${baseUrl}/${city.id}`,
        changeFrequency: 'daily',
        priority: 0.9,
    }))
}

// Meetings sitemap
export async function generateMeetingsSitemap(): Promise<MetadataRoute.Sitemap> {
    const cities = await getCities()
    const routes: MetadataRoute.Sitemap = []

    for (const city of cities) {
        for (const meeting of city.councilMeetings) {
            if (!meeting.released) continue
            routes.push({
                url: `${baseUrl}/${city.id}/meetings/${meeting.id}`,
                changeFrequency: 'weekly',
                priority: 0.7,
            })
        }
    }

    return routes
}

// Subjects sitemap
export async function generateSubjectsSitemap(): Promise<MetadataRoute.Sitemap> {
    const cities = await getCities()
    const routes: MetadataRoute.Sitemap = []

    for (const city of cities) {
        for (const meeting of city.councilMeetings) {
            if (!meeting.released) continue
            const subjects = await getSubjectsForMeeting(city.id, meeting.id)
            for (const subject of subjects) {
                routes.push({
                    url: `${baseUrl}/${city.id}/meetings/${meeting.id}/subjects/${subject.id}`,
                    changeFrequency: 'weekly',
                    priority: 0.6,
                })
            }
        }
    }

    return routes
}

// Main sitemap index
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const [staticSitemap, citiesSitemap, meetingsSitemap, subjectsSitemap] = await Promise.all([
        generateStaticSitemap(),
        generateCitiesSitemap(),
        generateMeetingsSitemap(),
        generateSubjectsSitemap()
    ])

    return [
        ...staticSitemap,
        ...citiesSitemap,
        ...meetingsSitemap,
        ...subjectsSitemap
    ]
} 