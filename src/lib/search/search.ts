"use server";
import { City, CouncilMeeting, Topic } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { PersonWithRelations } from '@/lib/db/people';
import { Client, estypes } from '@elastic/elasticsearch';
import { SegmentWithRelations } from "@/lib/db/speakerSegments";

// Define the type for our Elasticsearch document
interface SubjectDocument {
    public_subject_id: string;
    public_subject_name: string;
    public_subject_description: string;
    // Add other fields as needed
}

// Initialize Elasticsearch client
const client = new Client({
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    auth: {
        apiKey: process.env.ELASTICSEARCH_API_KEY || 'changeme'
    }
});

export type SearchConfig = {
    enableSemanticSearch?: boolean;
    enableHighlights?: boolean;
    size?: number;
    from?: number;
    rankWindowSize?: number;
    rankConstant?: number;
};

export type SearchRequest = {
    query: string;
    cityIds?: string[];
    personIds?: string[];
    partyIds?: string[];
    topicIds?: string[];
    dateRange?: {
        start: string;
        end: string;
    };
    location?: {
        point: {
            lat: number;
            lon: number;
        };
        radius: number;
    };
    config?: SearchConfig;
};

export type SearchResult = {
    id: string;
    name: string;
    description: string;
    councilMeeting: CouncilMeeting & {
        city: City;
    };
    topic: Topic | null | undefined;
    introducedBy?: PersonWithRelations;
    location?: {
        text: string;
        geojson: string;
    };
    score: number;
    speakerSegments: Array<SegmentWithRelations>;
    matchedSpeakerSegmentIds?: string[];
};

export type SearchResponse = {
    results: SearchResult[];
    total: number;
};

function buildFilters(request: SearchRequest): estypes.QueryDslQueryContainer[] {
    const filters: estypes.QueryDslQueryContainer[] = [];

    // Add city filter if specified
    if (request.cityIds && request.cityIds.length > 0) {
        filters.push({
            terms: {
                'public_subject_city_id': request.cityIds
            }
        });
    }

    // Add person filter if specified
    if (request.personIds && request.personIds.length > 0) {
        // Add filter for introduced by person
        filters.push({
            terms: {
                'public_subject_introduced_by_person_id': request.personIds
            }
        });

        // Add filter for speaker segments
        filters.push({
            nested: {
                path: 'public_subject_speaker_segments',
                query: {
                    bool: {
                        must: [
                            {
                                terms: {
                                    'public_subject_speaker_segments.speaker.person_id': request.personIds
                                }
                            }
                        ]
                    }
                }
            }
        });
    }

    // Add party filter if specified
    if (request.partyIds && request.partyIds.length > 0) {
        filters.push({
            terms: {
                'public_subject_introduced_by_party_id': request.partyIds
            }
        });
    }

    // Add topic filter if specified
    if (request.topicIds && request.topicIds.length > 0) {
        filters.push({
            terms: {
                'public_subject_topic_id': request.topicIds
            }
        });
    }

    // Add date range filter if specified
    if (request.dateRange) {
        filters.push({
            range: {
                'public_subject_meeting_date': {
                    gte: request.dateRange.start,
                    lte: request.dateRange.end
                }
            }
        });
    }

    // Add location filter if specified
    if (request.location) {
        filters.push({
            geo_distance: {
                distance: `${request.location.radius}km`,
                'public_subject_location_geojson': {
                    lat: request.location.point.lat,
                    lon: request.location.point.lon
                }
            }
        });
    }

    return filters;
}

export async function search(request: SearchRequest): Promise<SearchResponse> {
    try {
        // Build the search query
        const searchQuery: estypes.SearchRequest = {
            index: 'subjects',
            size: request.config?.size || 10,
            from: request.config?.from || 0,
            track_total_hits: true,
            retriever: {
                rrf: {
                    retrievers: [
                        {
                            standard: {
                                query: {
                                    bool: {
                                        should: [
                                            {
                                                // Multi-match query for regular fields
                                                // This is a more lenient search that will match if ANY of the terms are found
                                                // Example: If user searches for "αστικά απόβλητα ανακύκλωση"
                                                // It will match documents containing ANY of these terms in ANY of the fields
                                                // The boost values (^4, ^3, etc.) determine the relative importance of each field
                                                multi_match: {
                                                    query: request.query,
                                                    fields: [
                                                        'public_subject_name^4',           // Highest boost - most important identifier
                                                        'public_subject_description^3',    // High boost - detailed content
                                                    ],
                                                    type: 'best_fields',
                                                    operator: 'or'
                                                }
                                            },
                                            {
                                                // Nested query for speaker segments
                                                // This searches within the nested speaker_segments array
                                                // It will match if ANY of the terms are found in EITHER text or summary
                                                // Example: If user searches for "αστικά απόβλητα ανακύκλωση"
                                                // It will match if ANY of these terms appear in ANY speaker segment
                                                nested: {
                                                    path: 'public_subject_speaker_segments',
                                                    query: {
                                                        bool: {
                                                            should: [
                                                                {
                                                                    match: {
                                                                        'public_subject_speaker_segments.text': {
                                                                            query: request.query,
                                                                            boost: 2
                                                                        }
                                                                    }
                                                                },
                                                                {
                                                                    match: {
                                                                        'public_subject_speaker_segments.summary': {
                                                                            query: request.query,
                                                                            boost: 2
                                                                        }
                                                                    }
                                                                }
                                                            ],
                                                            minimum_should_match: 1
                                                        }
                                                    },
                                                    // Simplified inner_hits to only get segment IDs
                                                    inner_hits: {
                                                        _source: ['public_subject_speaker_segments.segment_id']
                                                    }
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1,
                                        filter: buildFilters(request)
                                    }
                                }
                            }
                        },
                        ...(request.config?.enableSemanticSearch ? [
                            {
                                standard: {
                                    query: {
                                        bool: {
                                            must: [
                                                {
                                                    // Semantic search on description field
                                                    // This uses the semantic_text field type to understand the meaning
                                                    // It will match documents with similar meaning, even if they don't contain
                                                    // the exact search terms
                                                    semantic: {
                                                        query: request.query,
                                                        field: 'public_subject_description.semantic'
                                                    }
                                                }
                                            ],
                                            filter: buildFilters(request)
                                        }
                                    }
                                }
                            }
                        ] : [])
                    ],
                    rank_window_size: request.config?.rankWindowSize || 100,
                    rank_constant: request.config?.rankConstant || 60
                }
            }
        };

        // Execute the search
        const response = await client.search(searchQuery);

        // Get total hits
        const total = response.hits.total as { value: number; relation: string };
        const totalHits = total.value;

        // Process the results
        const results = await Promise.all(
            (response.hits.hits as Array<estypes.SearchHit<SubjectDocument>>).map(async (hit) => {
                if (!hit._source) {
                    throw new Error('Elasticsearch hit source is undefined');
                }
                const subject = await prisma.subject.findUnique({
                    where: { id: hit._source.public_subject_id },
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
                });

                if (!subject) {
                    throw new Error(`Subject ${hit._source.public_subject_id} not found`);
                }

                // Get location coordinates if available
                let locationWithCoordinates: SearchResult['location'] | undefined = undefined;
                if (subject.location) {
                    const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
                        SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                        FROM "Location"
                        WHERE id = ${subject.location.id}
                        AND type = 'point'
                    `;

                    if (locationCoordinates.length > 0) {
                        locationWithCoordinates = {
                            text: subject.location.text,
                            geojson: JSON.stringify({
                                type: 'Point',
                                coordinates: [locationCoordinates[0].x, locationCoordinates[0].y]
                            })
                        };
                    }
                }

                // Transform speaker segments to match new SegmentWithRelations type
                const speakerSegments = subject.speakerSegments
                    .map(ss => ss.speakerSegment)
                    .filter(segment => {
                        // Safely check for minimum text length
                        const text = segment.utterances.map(u => u.text).join(' ');
                        // Safe check for person and roles
                        const hasPerson = segment.speakerTag?.person != null;
                        const hasRoles = Array.isArray(segment.speakerTag?.person?.roles);
                        // Only include segments with at least 100 characters and a person with roles
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

                // Process inner hits for speaker segments - simplified to just IDs
                const matchedSpeakerSegmentIds = hit.inner_hits?.['public_subject_speaker_segments']?.hits?.hits
                    .map(innerHit => innerHit._source?.segment_id)
                    .filter((id): id is string => id !== undefined);

                return {
                    id: subject.id,
                    name: subject.name,
                    description: subject.description,
                    councilMeeting: subject.councilMeeting,
                    topic: subject.topic,
                    introducedBy: subject.introducedBy || undefined,
                    location: locationWithCoordinates,
                    score: hit._score || 0,
                    speakerSegments,
                    matchedSpeakerSegmentIds
                };
            })
        );

        return {
            results,
            total: totalHits
        };
    } catch (error) {
        console.error('Search error:', error);
        throw new Error('Failed to execute search');
    }
}
