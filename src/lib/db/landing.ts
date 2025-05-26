"use server";

import { getCurrentUser } from "../auth";
import { City, CouncilMeeting, Subject, Party } from "@prisma/client";
import prisma from "./prisma";
import { SubjectWithRelations } from "./subject";
import { sortSubjectsByImportance } from "../utils";
import { getStatisticsFor, Statistics } from "../statistics";
import { PersonWithRelations } from '@/lib/db/people';

export type SubstackPost = {
    title: string;
    url: string;
    publishDate: Date;
};

export type LandingPageCity = City & {
    mostRecentMeeting: CouncilMeeting & {
        subjects: Subject[]
    }
    recentSubjects: (SubjectWithRelations & { statistics?: Statistics })[];
    personCount: number;
    partyCount: number;
    meetingCount: number;
    parties: Party[];
    persons: PersonWithRelations[];
};

export type LandingPageData = {
    cities: LandingPageCity[];
    latestPost?: SubstackPost;
};

async function fetchLatestSubstackPost(): Promise<SubstackPost | undefined> {
    try {
        const response = await fetch('https://schemalabs.substack.com/feed', {
            next: { revalidate: 3600 } // Revalidate every hour
        });
        const text = await response.text();

        // Find the first item in the feed
        const itemMatch = text.match(/<item>[\s\S]*?<\/item>/);
        if (!itemMatch) return undefined;

        const item = itemMatch[0];

        // Extract title and date from the item
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const linkMatch = item.match(/<link>(.*?)<\/link>/);
        const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

        if (titleMatch && linkMatch && dateMatch) {
            return {
                title: titleMatch[1],
                url: linkMatch[1],
                publishDate: new Date(dateMatch[1])
            };
        }
        return undefined;
    } catch (error) {
        console.error('Error fetching Substack feed:', error);
        return undefined;
    }
}

export async function getLandingPageData({ includeUnlisted = false }: { includeUnlisted?: boolean } = {}): Promise<LandingPageData> {
    const startTime = performance.now();

    // Get the current user if we need to include unlisted cities
    const currentUser = includeUnlisted ? await getCurrentUser() : null;

    // If includeUnlisted is true but user is not authorized, throw an error
    if (includeUnlisted && !currentUser) {
        throw new Error("Not authorized to view unlisted cities");
    }

    // Determine which cities to include based on authorization
    let cityFilter: any = {
        isPending: false
    };

    if (!includeUnlisted) {
        // For public view, only show listed cities
        cityFilter.isListed = true;
    } else if (!currentUser?.isSuperAdmin) {
        // For non-superadmins, only show cities they can administer
        const administerableCityIds = currentUser?.administers
            .filter(a => a.cityId)
            .map(a => a.cityId) || [];

        cityFilter = {
            ...cityFilter,
            OR: [
                { isListed: true },
                {
                    isListed: false,
                    id: { in: administerableCityIds }
                }
            ]
        };
    }
    // For superadmins, show all non-pending cities (no additional filter needed)

    const cities = await prisma.city.findMany({
        where: cityFilter,
        include: {
            parties: true,
            persons: {
                include: {
                    party: true,
                    roles: true
                }
            },
            councilMeetings: {
                where: {
                    released: true,
                    dateTime: {
                        lte: new Date()
                    },
                },
                orderBy: {
                    dateTime: 'desc'
                },
                include: {
                    subjects: {
                        include: {
                            speakerSegments: {
                                include: {
                                    speakerSegment: true
                                }
                            },
                            highlights: true,
                            location: true,
                            topic: true,
                            introducedBy: {
                                include: {
                                    party: true,
                                    roles: true
                                }
                            }
                        }
                    }
                },
                take: 3
            },
            _count: {
                select: {
                    persons: true,
                    parties: true,
                    councilMeetings: true
                }
            }
        }
    });

    const citiesWithStats = await Promise.all(cities.map(async city => {
        // Get hot subjects from last 3 meetings
        const recentSubjects = city.councilMeetings.flatMap(meeting =>
            meeting.subjects.map(subject => ({
                ...subject,
                councilMeeting: {
                    id: meeting.id,
                    name: meeting.name,
                    dateTime: meeting.dateTime
                }
            }))
        );

        const sortedRecentSubjects = sortSubjectsByImportance(recentSubjects);
        const statistics = await Promise.all(sortedRecentSubjects.map(subject =>
            getStatisticsFor({ subjectId: subject.id }, ["person"])
        ));
        const sortedRecentSubjectsWithStats = sortedRecentSubjects.map((subject, index) => ({
            ...subject,
            statistics: statistics[index]
        }));

        return {
            ...city,
            personCount: city._count.persons,
            partyCount: city._count.parties,
            meetingCount: city._count.councilMeetings,
            mostRecentMeeting: city.councilMeetings[0],
            recentSubjects: sortedRecentSubjectsWithStats,
            persons: city.persons
        };
    }));

    console.log(`Landing page data fetched in ${performance.now() - startTime}ms`);

    const latestPost = await fetchLatestSubstackPost();

    return {
        cities: citiesWithStats,
        latestPost
    };
}
