"use server";
import { City, CouncilMeeting, Party, Person, SpeakerSegment, Summary } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getEmbeddings, rerankDocuments } from "@/lib/voyage/voyage";
import { getCities } from "../db/cities";
import { PersonWithRelations } from '@/lib/db/people';

export type SearchRequest = {
    query: string;
    cityId?: string;
    personId?: string;
    partyId?: string;
}

export type SearchResult = {
    city: City;
    councilMeeting: CouncilMeeting;
    relevanceScore?: number;
    speakerSegment: (SpeakerSegment & {
        person?: PersonWithRelations;
        personLabel?: string;
        party?: Party;
        summary?: { text: string };
        text?: string;
    });
};

export async function getLatestSegmentsForSpeaker(
    personId: string,
    page: number = 1,
    pageSize: number = 5,
    administrativeBodyId?: string | null
): Promise<{ results: SearchResult[], totalCount: number }> {
    const skip = (page - 1) * pageSize;

    const [segments, totalCount] = await Promise.all([
        prisma.speakerSegment.findMany({
            where: {
                speakerTag: {
                    personId: personId
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                meeting: administrativeBodyId ? {
                    administrativeBodyId: administrativeBodyId
                } : undefined
            },
            include: {
                meeting: {
                    include: {
                        city: true
                    }
                },
                speakerTag: {
                    include: {
                        person: {
                            include: {
                                party: true,
                                roles: true
                            }
                        }
                    }
                },
                utterances: true,
                summary: true
            },
            orderBy: [
                {
                    meeting: {
                        dateTime: 'desc'
                    }
                },
                {
                    startTimestamp: 'desc'
                }
            ],
            take: pageSize,
            skip
        }),
        prisma.speakerSegment.count({
            where: {
                speakerTag: {
                    personId: personId
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                meeting: administrativeBodyId ? {
                    administrativeBodyId: administrativeBodyId
                } : undefined
            }
        })
    ]);

    const results = segments
        .filter(segment => segment.utterances.reduce((acc, u) => acc + u.text.length, 0) >= 100)
        .map(segment => ({
            city: segment.meeting.city,
            councilMeeting: segment.meeting,
            speakerSegment: {
                ...segment,
                person: segment.speakerTag?.person || undefined,
                personLabel: segment.speakerTag?.label || undefined,
                party: segment.speakerTag?.person?.party || undefined,
                summary: segment.summary ? { text: segment.summary.text } : undefined,
                text: segment.utterances.map(u => u.text).join(' ')
            }
        }));

    return {
        results,
        totalCount
    };
}

export async function getLatestSegmentsForParty(
    partyId: string,
    page: number = 1,
    pageSize: number = 5,
    administrativeBodyId?: string | null
): Promise<{ results: SearchResult[], totalCount: number }> {
    const skip = (page - 1) * pageSize;

    type SegmentWithRelations = Prisma.SpeakerSegmentGetPayload<{
        include: {
            meeting: {
                include: {
                    city: true
                }
            },
            speakerTag: {
                include: {
                    person: {
                        include: {
                            roles: {
                                include: {
                                    party: true
                                }
                            }
                        }
                    }
                }
            },
            utterances: true,
            summary: true
        }
    }>;

    const [segments, totalCount] = await Promise.all([
        prisma.speakerSegment.findMany({
            where: {
                speakerTag: {
                    person: {
                        roles: {
                            some: {
                                partyId: partyId
                            }
                        }
                    }
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                meeting: administrativeBodyId ? {
                    administrativeBodyId: administrativeBodyId
                } : undefined
            },
            include: {
                meeting: {
                    include: {
                        city: true
                    }
                },
                speakerTag: {
                    include: {
                        person: {
                            include: {
                                roles: {
                                    where: {
                                        partyId: partyId
                                    },
                                    include: {
                                        party: true
                                    }
                                }
                            }
                        }
                    }
                },
                utterances: true,
                summary: true
            },
            orderBy: [
                {
                    meeting: {
                        dateTime: 'desc'
                    }
                },
                {
                    startTimestamp: 'desc'
                }
            ],
            take: pageSize,
            skip
        }) as Promise<SegmentWithRelations[]>,
        prisma.speakerSegment.count({
            where: {
                speakerTag: {
                    person: {
                        roles: {
                            some: {
                                partyId: partyId
                            }
                        }
                    }
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                meeting: administrativeBodyId ? {
                    administrativeBodyId: administrativeBodyId
                } : undefined
            }
        })
    ]);

    const results = segments
        .filter((segment: SegmentWithRelations) => {
            const totalLength = segment.utterances.reduce((acc: number, u: { text: string }) => acc + u.text.length, 0);
            return totalLength >= 100;
        })
        .map((segment: SegmentWithRelations) => {
            // Find the active role at the time of the meeting
            const activeRole = segment.speakerTag?.person?.roles.find(role => {
                const meetingDate = new Date(segment.meeting.dateTime);
                const startDate = role.startDate ? new Date(role.startDate) : null;
                const endDate = role.endDate ? new Date(role.endDate) : null;

                return (!startDate || startDate <= meetingDate) &&
                    (!endDate || endDate >= meetingDate);
            });

            // Only include segments where the person had an active role in the party at the time of the meeting
            if (!activeRole) {
                return null;
            }

            return {
                city: segment.meeting.city,
                councilMeeting: segment.meeting,
                speakerSegment: {
                    ...segment,
                    person: segment.speakerTag?.person || undefined,
                    party: activeRole.party || undefined,
                    summary: segment.summary ? { text: segment.summary.text } : undefined,
                    text: segment.utterances.map(u => u.text).join(' ')
                }
            };
        })
        .filter((result): result is NonNullable<typeof result> => result !== null);

    return {
        results,
        totalCount: results.length // Update totalCount to reflect filtered results
    };
}


const RERANK = false;
const MAX_RESULTS = 50;
export async function search(request: SearchRequest): Promise<SearchResult[]> {
    const { query, cityId, personId, partyId } = request;

    // Get embedding for the query
    const [queryEmbedding] = await getEmbeddings([query]);

    // Perform similarity search using raw SQL
    const rawResults: any[] = await prisma.$queryRaw`
        WITH ranked_segments AS (
            SELECT 
                ss."id",
                ss."meetingId",
                ss."cityId",
                ss.embedding <=> ${Prisma.raw(`'[${queryEmbedding.join(',')}]'::vector`)} AS distance
            FROM "SpeakerSegment" ss
            WHERE 
                ${cityId ? Prisma.sql`ss."cityId" = ${cityId}` : Prisma.sql`1=1`}
                ${personId ? Prisma.sql`AND ss."speakerTagId" IN (SELECT "id" FROM "SpeakerTag" WHERE "personId" = ${personId})` : Prisma.sql``}
                ${partyId ? Prisma.sql`AND ss."speakerTagId" IN (SELECT st."id" FROM "SpeakerTag" st JOIN "Person" p ON st."personId" = p."id" WHERE p."partyId" = ${partyId})` : Prisma.sql``}
                AND (
                    SELECT SUM(LENGTH(u."text"))
                    FROM "Utterance" u
                    WHERE u."speakerSegmentId" = ss."id"
                ) >= 100
                AND ss.embedding IS NOT NULL
            LIMIT ${MAX_RESULTS}
        )
        SELECT 
            COUNT(*) OVER() as total_count,
            c."id" as city_id,
            c."name" as city_name,
            cm."id" as meeting_id,
            cm."name" as meeting_name,
            ss."id" as segment_id,
            p."id" as person_id,
            p."name" as person_name,
            party."id" as party_id,
            party."name" as party_name,
            s."text" as summary_text,
            string_agg(u."text", ' ') as utterance_text,
            rs.distance
        FROM ranked_segments rs
        JOIN "SpeakerSegment" ss ON ss."id" = rs."id"
        JOIN "CouncilMeeting" cm ON cm."id" = ss."meetingId"
        JOIN "City" c ON c."id" = ss."cityId"
        LEFT JOIN "SpeakerTag" st ON st."id" = ss."speakerTagId"
        LEFT JOIN "Person" p ON p."id" = st."personId"
        LEFT JOIN "Party" party ON party."id" = p."partyId"
        LEFT JOIN "Summary" s ON s."speakerSegmentId" = ss."id"
        LEFT JOIN "Utterance" u ON u."speakerSegmentId" = ss."id"
        GROUP BY c."id", c."name", cm."id", cm."name", ss."id", p."id", p."name", party."id", party."name", s."text", rs.distance
        ORDER BY rs.distance ASC
        LIMIT ${MAX_RESULTS}
    `;

    console.log('Query results:', rawResults);

    // Transform rawResults into results
    const results = rawResults.map(row => ({
        city: {
            id: row.city_id,
            name: row.city_name,
        },
        councilMeeting: {
            id: row.meeting_id,
            name: row.meeting_name,
        },
        speakerSegment: {
            id: row.segment_id,
            summary: row.summary_text ? {
                text: row.summary_text,
            } : null,
            utterances: [{
                text: row.utterance_text,
            }],
        },
        person: row.person_id ? {
            id: row.person_id,
            name: row.person_name,
        } : null,
        party: row.party_id ? {
            id: row.party_id,
            name: row.party_name,
        } : null,
        distance: row.distance,
    }));

    console.log('Transformed results:', results);

    let sortedResults;

    if (RERANK) {
        // Extract texts for reranking
        const texts = results.map(r => r.speakerSegment?.summary?.text || '');

        if (texts.length === 0) {
            return [];
        }

        // Rerank results
        const rerankedResults = await rerankDocuments(query, texts);

        console.log('Reranked results:', rerankedResults);

        // Sort the results based on the reranking scores
        sortedResults = rerankedResults.data
            .map(item => ({
                ...results[item.index],
                relevanceScore: item.relevance_score
            }))
            .sort((a, b) => b.relevanceScore - a.relevanceScore);

        console.log('Sorted results:', sortedResults);
    } else {
        // If not reranking, use the distance as the relevance score
        sortedResults = results.map(result => ({
            ...result,
            relevanceScore: 1 / (1 + result.distance) // Convert distance to a score between 0 and 1
        })).sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    // Use Prisma to get the full results
    const fullResults = await Promise.all(sortedResults.map(async (result) => {
        const fullSpeakerSegment = await prisma.speakerSegment.findUnique({
            where: { id: result.speakerSegment.id },
            include: {
                speakerTag: {
                    include: {
                        person: {
                            include: {
                                party: true,
                                roles: true
                            }
                        }
                    }
                },
                summary: true,
                meeting: {
                    include: {
                        city: true
                    }
                },
                utterances: {
                    orderBy: {
                        startTimestamp: 'asc'
                    }
                }
            }
        });



        if (!fullSpeakerSegment) {
            throw new Error(`SpeakerSegment with id ${result.speakerSegment.id} not found`);
        }

        return {
            city: fullSpeakerSegment.meeting.city,
            councilMeeting: fullSpeakerSegment.meeting,
            relevanceScore: result.relevanceScore,
            speakerSegment: {
                id: fullSpeakerSegment.id,
                startTimestamp: fullSpeakerSegment.startTimestamp,
                endTimestamp: fullSpeakerSegment.endTimestamp,
                createdAt: fullSpeakerSegment.createdAt,
                updatedAt: fullSpeakerSegment.updatedAt,
                meetingId: fullSpeakerSegment.meetingId,
                cityId: fullSpeakerSegment.cityId,
                speakerTagId: fullSpeakerSegment.speakerTagId,
                person: fullSpeakerSegment.speakerTag.person || undefined,
                party: fullSpeakerSegment.speakerTag.person?.party || undefined,
                summary: fullSpeakerSegment.summary || undefined,
                text: fullSpeakerSegment.utterances.map(u => u.text).join(' ')
            }
        };
    }));

    if (cityId) {
        return fullResults;
    } else {
        // Filter out results for cities that are not listed
        const listedCities = await getCities();
        const resultsOfListedCities = fullResults.filter(result => listedCities.some(city => city.id === result.city.id));

        return resultsOfListedCities;
    }
}