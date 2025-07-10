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
            lastModified: new Date(),
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
            lastModified: new Date('2024-09-15'),
            changeFrequency: 'monthly',
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
            lastModified: new Date('2024-09-15'),
            changeFrequency: 'monthly',
            priority: 0.9,
            alternates: {
                languages: {
                    el: `${baseUrl}/explain`,
                    en: `${baseUrl}/en/explain`
                }
            }
        },
        {
            url: `${baseUrl}/corrections`,
            lastModified: new Date('2024-09-15'),
            changeFrequency: 'monthly',
            priority: 0.7,
            alternates: {
                languages: {
                    el: `${baseUrl}/corrections`,
                    en: `${baseUrl}/en/corrections`
                }
            }
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified: new Date('2024-09-15'),
            changeFrequency: 'monthly',
            priority: 0.6,
            alternates: {
                languages: {
                    el: `${baseUrl}/privacy`,
                    en: `${baseUrl}/en/privacy`
                }
            }
        },
        {
            url: `${baseUrl}/terms`,
            lastModified: new Date('2024-09-15'),
            changeFrequency: 'monthly',
            priority: 0.6,
            alternates: {
                languages: {
                    el: `${baseUrl}/terms`,
                    en: `${baseUrl}/en/terms`
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
        lastModified: new Date(city.updatedAt),
        changeFrequency: city.officialSupport ? 'daily' : 'weekly',
        priority: city.officialSupport ? 0.9 : 0.7,
        alternates: {
            languages: {
                el: `${baseUrl}/${city.id}`,
                en: `${baseUrl}/en/${city.id}`
            }
        }
    }))
}

// Consultations sitemap
export async function generateConsultationsSitemap(): Promise<MetadataRoute.Sitemap> {
    const cities = await getCities()
    const routes: MetadataRoute.Sitemap = []

    for (const city of cities) {
        // Add consultations index page for cities that have consultations enabled
        if ((city as any).consultationsEnabled) {
            routes.push({
                url: `${baseUrl}/${city.id}/consultations`,
                lastModified: new Date(city.updatedAt),
                changeFrequency: 'weekly',
                priority: 0.8,
                alternates: {
                    languages: {
                        el: `${baseUrl}/${city.id}/consultations`,
                        en: `${baseUrl}/en/${city.id}/consultations`
                    }
                }
            })
        }
    }

    return routes
}

// Meetings sitemap
export async function generateMeetingsSitemap(): Promise<MetadataRoute.Sitemap> {
    const cities = await getCitiesWithCouncilMeetings()
    const routes: MetadataRoute.Sitemap = []

    for (const city of cities) {
        for (const meeting of city.councilMeetings) {
            if (!meeting.released) continue
            
            const meetingDate = new Date(meeting.dateTime)
            const isRecent = (Date.now() - meetingDate.getTime()) < (30 * 24 * 60 * 60 * 1000) // 30 days
            
            routes.push({
                url: `${baseUrl}/${city.id}/meetings/${meeting.id}`,
                lastModified: new Date(meeting.updatedAt),
                changeFrequency: isRecent ? 'daily' : 'weekly',
                priority: isRecent ? 0.8 : 0.7,
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
            
            const meetingDate = new Date(meeting.dateTime)
            const isRecent = (Date.now() - meetingDate.getTime()) < (30 * 24 * 60 * 60 * 1000) // 30 days
            
            for (const subject of subjects) {
                routes.push({
                    url: `${baseUrl}/${city.id}/meetings/${meeting.id}/subjects/${subject.id}`,
                    lastModified: new Date(subject.updatedAt || meeting.updatedAt),
                    changeFrequency: isRecent ? 'weekly' : 'monthly',
                    priority: isRecent ? 0.7 : 0.6,
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
    const [staticSitemap, citiesSitemap, consultationsSitemap, meetingsSitemap, subjectsSitemap] = await Promise.all([
        generateStaticSitemap(),
        generateCitiesSitemap(),
        generateConsultationsSitemap(),
        generateMeetingsSitemap(),
        generateSubjectsSitemap()
    ])

    return [
        ...staticSitemap,
        ...citiesSitemap,
        ...consultationsSitemap,
        ...meetingsSitemap,
        ...subjectsSitemap
    ]
} 