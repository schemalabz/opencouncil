"use server";

import { Client } from '@elastic/elasticsearch';
import prisma from "@/lib/db/prisma";
import { SearchRequest, SearchResponse, SearchResultLight, SearchResultDetailed, SubjectDocument } from './types';
import { buildSearchQuery } from './query';
import { extractFilters, processFilters } from './filters';
import { executeElasticsearchWithRetry } from './retry';
import { getCities } from '@/lib/db/cities';
import { env } from '@/env.mjs';

// Re-export types
export type {
    SearchResultLight,
    SearchResultDetailed,
    SearchConfig,
} from './types';

// Initialize Elasticsearch client
const client = new Client({
    node: env.ELASTICSEARCH_URL,
    auth: {
        apiKey: env.ELASTICSEARCH_API_KEY
    }
});

// Helper function for essential logs that should always be shown
const logEssential = (message: string, data?: any) => {
    console.log(`[Search Analytics] ${message}`, data || '');
};

export async function search(request: SearchRequest): Promise<SearchResponse> {
    try {
        // Get default city IDs if none provided
        let cityIds = request.cityIds;
        if (!cityIds || cityIds.length === 0) {
            const cities = await getCities();
            cityIds = cities.map(city => city.id);
        }

        // Log search session start with query and filters
        logEssential('Search Session Started', {
            query: request.query,
            filters: {
                cityIds,
                personIds: request.personIds,
                partyIds: request.partyIds,
                topicIds: request.topicIds,
                dateRange: request.dateRange,
                hasLocations: request.locations ? request.locations.length > 0 : false
            }
        });

        // Extract filters from the query
        const extractedFilters = await extractFilters(request.query);
        logEssential('[Search] Extracted filters:', extractedFilters);

        // Process filters and resolve locations
        const processedFilters = await processFilters(extractedFilters);

        // Merge with explicit filters
        const mergedRequest: SearchRequest = {
            ...request,
            cityIds: processedFilters.cityIds || cityIds,
            dateRange: processedFilters.dateRange || request.dateRange,
            locations: processedFilters.locations || request.locations
        };

        // Build and execute the search query with retry logic
        const searchQuery = buildSearchQuery(mergedRequest, extractedFilters);
        
        logEssential('Executing search query', { 
            hasSemanticSearch: request.config?.enableSemanticSearch 
        });

        const response = await executeElasticsearchWithRetry(
            () => client.search(searchQuery),
            'Search'
        );

        // Get total hits
        const total = response.hits.total as { value: number; relation: string };
        const totalHits = total.value;

        // Log search session completion with results summary
        logEssential('Search Session Completed', {
            query: request.query,
            results: {
                totalHits,
                resultCount: response.hits.hits.length,
                took: `${response.took}ms`,
                topScore: response.hits.hits[0]?._score || 0
            }
        });

        // Process the results
        const subjectIds = (response.hits.hits as Array<any>)
            .map(hit => hit._source?.id)
            .filter((id): id is string => id !== undefined);

        // Fetch all subjects in a single query
        const subjects = await prisma.subject.findMany({
            where: { id: { in: subjectIds } },
            include: {
                speakerSegments: {
                    include: {
                        speakerSegment: {
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
                                                        party: true,
                                                        city: true,
                                                        administrativeBody: true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                utterances: true,
                                summary: true
                            }
                        }
                    }
                },
                location: true,
                topic: true,
                councilMeeting: {
                    include: {
                        city: true
                    }
                },
                introducedBy: {
                    include: {
                        roles: {
                            include: {
                                party: true,
                                city: true,
                                administrativeBody: true
                            }
                        }
                    }
                },
                contributions: {
                    include: {
                        speaker: {
                            include: {
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
                highlights: true
            }
        });

        // Create a map of subjects by ID for efficient lookup
        const subjectMap = new Map(subjects.map(subject => [subject.id, subject]));

        // Get all location IDs for coordinates query
        const locationIds = subjects
            .map(subject => subject.location?.id)
            .filter((id): id is string => id !== undefined);

        // Fetch all location coordinates in a single query
        const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
            SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
            FROM "Location"
            WHERE id = ANY(${locationIds})
            AND type = 'point'
        `;

        // Create a map of location coordinates by ID
        const locationCoordinatesMap = new Map(
            locationCoordinates.map(loc => [loc.id, { x: loc.x, y: loc.y }])
        );

        const results = await Promise.all(
            (response.hits.hits as Array<any>).map(async (hit, index) => {
                if (!hit._source) {
                    logEssential('[Search] Invalid hit source', { index, score: hit._score });
                    throw new Error('Elasticsearch hit source is undefined');
                }

                const subject = subjectMap.get(hit._source.id);
                if (!subject) {
                    logEssential('[Search] Subject not found', {
                        subjectId: hit._source.id,
                        score: hit._score
                    });
                    throw new Error(`Subject ${hit._source.id} not found`);
                }

                // Get location coordinates if available
                let locationWithCoordinates = null;
                if (subject.location) {
                    const coordinates = locationCoordinatesMap.get(subject.location.id);
                    if (coordinates) {
                        locationWithCoordinates = {
                            ...subject.location,
                            coordinates
                        };
                    }
                }

                // Process inner hits for speaker segments
                const matchedSpeakerSegmentIds = hit.inner_hits?.['speaker_segments']?.hits?.hits
                    .map((innerHit: { _source?: { segment_id?: string } }) => innerHit._source?.segment_id)
                    .filter((id: string | undefined): id is string => id !== undefined);

                // Base result with common fields
                const baseResult: SearchResultLight = {
                    ...subject,
                    location: locationWithCoordinates,
                    score: hit._score || 0,
                    matchedSpeakerSegmentIds,
                    councilMeeting: subject.councilMeeting
                };

                // If detailed results are requested, add speaker segment text
                if (request.config?.detailed) {
                    const speakerSegments = subject.speakerSegments
                        .map(ss => ss.speakerSegment)
                        .filter(segment => {
                            const text = segment.utterances.map(u => u.text).join(' ');
                            const hasPerson = segment.speakerTag?.person != null;
                            const hasRoles = Array.isArray(segment.speakerTag?.person?.roles);
                            return text.length >= 100 && hasPerson && hasRoles;
                        })
                        .map(segment => ({
                            id: segment.id,
                            startTimestamp: segment.startTimestamp,
                            endTimestamp: segment.endTimestamp,
                            meeting: segment.meeting,
                            person: segment.speakerTag?.person || null,
                            text: segment.utterances.map(u => u.text).join(' '),
                            summary: segment.summary ? { text: segment.summary.text } : null
                        }));

                    return {
                        ...baseResult,
                        speakerSegments,
                        context: subject.context
                    } as SearchResultDetailed;
                }

                return baseResult;
            })
        );

        return {
            results,
            total: totalHits
        };
    } catch (error) {
        // Log search session failure
        logEssential('Search Session Failed', {
            query: request.query,
            error: error instanceof Error ? error.message : 'Unknown error',
            filters: {
                cityIds: request.cityIds,
                personIds: request.personIds,
                partyIds: request.partyIds,
                topicIds: request.topicIds,
                dateRange: request.dateRange,
                hasLocations: request.locations ? request.locations.length > 0 : false
            }
        });
        throw new Error('Failed to execute search');
    }
}
