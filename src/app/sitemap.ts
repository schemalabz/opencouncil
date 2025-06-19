import { MetadataRoute } from 'next'
import { getCities, getCitiesWithCouncilMeetings } from '@/lib/db/cities'
import { getSubjectsForMeeting } from '@/lib/db/subject'
import { env } from '@/env.mjs'

const baseUrl = env.NEXT_PUBLIC_BASE_URL

// Static sitemap for non-dynamic routes
export async function generateStaticSitemap(): Promise<MetadataRoute.Sitemap> {
    return [
        {
            url: baseUrl,
            changeFrequency: 'daily',
            priority: 1,
            alternates: {
                languages: {
                    el: baseUrl,
                    en: `${baseUrl}/en`
                }
            }
        },
        {
            url: `${baseUrl}/about`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: {
                languages: {
                    el: `${baseUrl}/about`,
                    en: `${baseUrl}/en/about`
                }
            }
        },
        {
            url: `${baseUrl}/explain`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: {
                languages: {
                    el: `${baseUrl}/explain`,
                    en: `${baseUrl}/en/explain`
                }
            }
        },
        {
            url: `${baseUrl}/corrections`,
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: {
                languages: {
                    el: `${baseUrl}/corrections`,
                    en: `${baseUrl}/en/corrections`
                }
            }
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
        alternates: {
            languages: {
                el: `${baseUrl}/${city.id}`,
                en: `${baseUrl}/en/${city.id}`
            }
        }
    }))
}

// Meetings sitemap
export async function generateMeetingsSitemap(): Promise<MetadataRoute.Sitemap> {
    const cities = await getCitiesWithCouncilMeetings()
    const routes: MetadataRoute.Sitemap = []

    for (const city of cities) {
        for (const meeting of city.councilMeetings) {
            if (!meeting.released) continue
            routes.push({
                url: `${baseUrl}/${city.id}/meetings/${meeting.id}`,
                changeFrequency: 'weekly',
                priority: 0.7,
                alternates: {
                    languages: {
                        el: `${baseUrl}/${city.id}/meetings/${meeting.id}`,
                        en: `${baseUrl}/en/${city.id}/meetings/${meeting.id}`
                    }
                }
            })
        }
    }

    return routes
}

// Subjects sitemap
export async function generateSubjectsSitemap(): Promise<MetadataRoute.Sitemap> {
    const cities = await getCitiesWithCouncilMeetings()
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
                    alternates: {
                        languages: {
                            el: `${baseUrl}/${city.id}/meetings/${meeting.id}/subjects/${subject.id}`,
                            en: `${baseUrl}/en/${city.id}/meetings/${meeting.id}/subjects/${subject.id}`
                        }
                    }
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