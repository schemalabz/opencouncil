"use server";

import { isUserAuthorizedToEdit } from "../auth";
import { getCities } from "./cities";
import { City, CouncilMeeting, Subject, Person, Party } from "@prisma/client";
import prisma from "./prisma";
import { SubjectWithRelations } from "./subject";
import { sortSubjectsByImportance } from "../utils";
import { getStatisticsFor, Statistics } from "../statistics";


export type LandingPageCity = City & {
    mostRecentMeeting: CouncilMeeting & {
        subjects: Subject[]
    }
    recentSubjects: (SubjectWithRelations & { statistics?: Statistics })[];
    personCount: number;
    partyCount: number;
    meetingCount: number;
    parties: Party[];
};

export async function getLandingPageData({ includeUnlisted = false }: { includeUnlisted?: boolean } = {}): Promise<LandingPageCity[]> {
    const startTime = performance.now();
    if (includeUnlisted) {
        await isUserAuthorizedToEdit({});
    }

    const cities = await prisma.city.findMany({
        where: {
            isListed: includeUnlisted ? undefined : true
        },
        include: {
            parties: true,
            councilMeetings: {
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
                            topic: true
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
            recentSubjects: sortedRecentSubjectsWithStats
        };
    }));

    console.log(`Landing page data fetched in ${performance.now() - startTime}ms`);

    return citiesWithStats;
}
