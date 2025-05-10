"use server";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getEmbeddings, rerankDocuments } from "@/lib/voyage/voyage";
import { getCities } from "../db/cities";
import { SegmentWithRelations } from '@/lib/db/speakerSegments';

export type SearchRequest = {
    query: string;
    cityId?: string;
    personId?: string;
    partyId?: string;
}

export type SearchResult = {
    relevanceScore?: number;
    speakerSegment: SegmentWithRelations;
};

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
                                roles: {
                                    include: {
                                        party: true,
                                        city: true,
                                        administrativeBody: true
                                    }
                                }
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
            relevanceScore: result.relevanceScore,
            speakerSegment: fullSpeakerSegment
        };
    }));

    if (cityId) {
        return fullResults;
    } else {
        // Filter out results for cities that are not listed
        const listedCities = await getCities();
        const resultsOfListedCities = fullResults.filter(result => 
            listedCities.some(city => city.id === result.speakerSegment.meeting.city.id)
        );

        return resultsOfListedCities;
    }
}