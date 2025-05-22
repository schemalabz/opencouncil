"use server";
import { City, CouncilMeeting } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { Client, estypes } from '@elastic/elasticsearch';
import { SegmentWithRelations } from "@/lib/db/speakerSegments";
import { SubjectWithRelations, LocationWithCoordinates } from '@/lib/db/subject';
import { aiChat } from '@/lib/ai';
import { getCities, getCitiesWithGeometry } from '@/lib/db/cities';
import { getPlaceSuggestions, getPlaceDetails } from '@/lib/google-maps';
import { calculateGeometryBounds } from '@/lib/utils';

// @TODO: Better central logging
const isDevelopment = process.env.NODE_ENV === 'development';

// Helper function for conditional logging
const log = (message: string, data?: any) => {
    if (isDevelopment) {
        console.log(message, data || '');
    }
};

// Helper function for essential logs that should always be shown
const logEssential = (message: string, data?: any) => {
    console.log(`[Search Analytics] ${message}`, data || '');
};

// Define the type for our Elasticsearch document
interface SubjectDocument {
    public_subject_id: string;
    public_subject_name: string;
    public_subject_description: string;
    public_subject_location_text: string;
    // Add other fields as needed
}

// Initialize Elasticsearch client
const client = new Client({
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    auth: {
        apiKey: process.env.ELASTICSEARCH_API_KEY || 'changeme'
    }
});

// Lightweight search result for the search page
export type SearchResultLight = SubjectWithRelations & {
    score: number;
    matchedSpeakerSegmentIds?: string[];
    councilMeeting: CouncilMeeting & {
        city: City;
    };
};

// Detailed search result with speaker segment text
export type SearchResultDetailed = SearchResultLight & {
    speakerSegments: SegmentWithRelations[];
    context?: string;
};

export type SearchConfig = {
    enableSemanticSearch?: boolean;
    enableHighlights?: boolean;
    size?: number;
    from?: number;
    rankWindowSize?: number;
    rankConstant?: number;
    detailed?: boolean; // Whether to return detailed results
};

export type Location = {
    point: {
        lat: number;
        lon: number;
    };
    radius: number;
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
    locations?: Location[];
    config?: SearchConfig;
};

export type SearchResponse = {
    results: SearchResultLight[] | SearchResultDetailed[];
    total: number;
};

// Define our simplified filter extraction types
interface ExtractedFilters {
    cityIds: string[] | null;
    dateRange: {
        start: string;
        end: string;
    } | null;
    isLatest: boolean | null;
    locationName: string | null;
}

// Get cities for the prompt
async function getCitiesForPrompt(): Promise<{ id: string; name: string; name_en: string }[]> {
    const cities = await getCities();
    return cities.map(city => ({
        id: city.id,
        name: city.name,
        name_en: city.name_en
    }));
}

// Define the system prompt for filter extraction
const FILTER_EXTRACTION_PROMPT = `Εξαγωγή Φίλτρων Αναζήτησης

Είστε ένας βοηθός εξαγωγής φίλτρων. Η δουλειά σας είναι να αναλύετε ερωτήσεις αναζήτησης και να εξάγετε σχετικά φίλτρα.
Επιστρέψτε ΜΟΝΟ ένα αντικείμενο JSON με την ακόλουθη δομή:
{
    "cityIds": string[] | null,
    "dateRange": { start: string, end: string } | null,
    "isLatest": boolean | null,
    "locationName": string | null
}

Κανόνες:
1. Συμπεριλάβετε μόνο φίλτρα που αναφέρονται ρητά ή σιωπηρά στην ερώτηση
2. Για ημερομηνίες, χρησιμοποιήστε μορφή ISO 8601
3. Για τα IDs των πόλεων, χρησιμοποιήστε τα ακριβή IDs από τη λίστα πόλεων
4. Για τοποθεσίες, εξάγετε μόνο το όνομα της τοποθεσίας (π.χ., "Πλατεία Συντάγματος", "Εθνικός Κήπος")
5. Επιστρέψτε null (όχι undefined) για οποιοδήποτε φίλτρο δεν βρέθηκε
6. Για ερωτήσεις "τελευταία", ορίστε isLatest σε true και συμπεριλάβετε το σχετικό cityId

Διαθέσιμες πόλεις:
{{CITIES_LIST}}`;

// Function to extract filters using aiChat
async function extractFilters(query: string): Promise<ExtractedFilters> {
    // Get cities for the prompt
    const cities = await getCitiesForPrompt();
    
    // Format cities list for the prompt
    const citiesList = cities.map(city => 
        `- ${city.name} (${city.name_en}): ${city.id}`
    ).join('\n');
    
    // Create the prompt with cities list
    const prompt = FILTER_EXTRACTION_PROMPT.replace('{{CITIES_LIST}}', citiesList);
    
    const { result } = await aiChat<ExtractedFilters>(prompt, query);
    return result;
}

// Function to resolve location coordinates
async function resolveLocationCoordinates(locationName: string, cityId: string): Promise<Location | undefined> {
    try {
        log(`[Location] Resolving coordinates for "${locationName}" in city ${cityId}`);
        
        // Get city with geometry directly
        const citiesWithGeometry = await getCitiesWithGeometry([{ id: cityId } as City]);
        const cityWithGeometry = citiesWithGeometry[0];
        
        if (!cityWithGeometry) {
            log('[Location] City not found or failed to get geometry');
            return undefined;
        }

        // Calculate city center from geometry
        const { center } = calculateGeometryBounds(cityWithGeometry.geometry);

        // Get place suggestions with city center
        const suggestions = await getPlaceSuggestions(locationName, cityWithGeometry.name, center);
        log(`[Location] Found ${suggestions.length} place suggestions`);
        log('[Location] Suggestions:', suggestions);

        if (suggestions.length === 0) {
            log('[Location] No place suggestions found');
            return undefined;
        }

        // Get details for the first suggestion
        const details = await getPlaceDetails(suggestions[0].placeId);
        if (!details) {
            log('[Location] Failed to get place details');
            return undefined;
        }

        log('[Location] Place details:', {
            city: cityId,
            text: details.text,
            coordinates: details.coordinates
        });

        // Convert coordinates to the expected format
        return {
            point: {
                lat: details.coordinates[1],
                lon: details.coordinates[0]
            },
            radius: 40000 // Using the same radius as in actions.ts
        };
    } catch (error) {
        logEssential('[Location] Error resolving location coordinates:', error);
        return undefined;
    }
}

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
    if (request.locations && request.locations.length > 0) {
        if (request.locations.length === 1) {
            // Single location case
            filters.push({
                geo_distance: {
                    distance: `${request.locations[0].radius}km`,
                    'public_subject_location_geojson': {
                        lat: request.locations[0].point.lat,
                        lon: request.locations[0].point.lon
                    }
                }
            });
        } else {
            // Multiple locations case
            filters.push({
                bool: {
                    should: request.locations.map(loc => ({
                        geo_distance: {
                            distance: `${loc.radius}km`,
                            'public_subject_location_geojson': {
                                lat: loc.point.lat,
                                lon: loc.point.lon
                            }
                        }
                    })),
                    minimum_should_match: 1
                }
            });
        }
    }

    return filters;
}

export async function search(request: SearchRequest): Promise<SearchResponse> {
    try {
        // Log search session start with query and filters
        logEssential('Search Session Started', {
            query: request.query,
            filters: {
                cityIds: request.cityIds,
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
        
        // Resolve location coordinates if a location name was extracted
        let locations: Location[] = [];
        if (extractedFilters.locationName) {
            const locationName = extractedFilters.locationName;
            if (extractedFilters.cityIds?.[0]) {
                // If we have a specific city, try that first
                const location = await resolveLocationCoordinates(
                    locationName,
                    extractedFilters.cityIds[0]
                );
                if (location) {
                    locations.push(location);
                    log('[Search] Resolved location for specific city:', location);
                }
            } else {
                // If no specific city, try all cities
                log('[Search] No specific city provided, trying all cities');
                const cities = await getCities();
                
                // Try each city and collect all matches
                const locationPromises = cities.map(async (city) => {
                    const location = await resolveLocationCoordinates(
                        locationName,
                        city.id
                    );
                    if (location) {
                        return location;
                    }
                    return null;
                });

                const results = await Promise.all(locationPromises);
                locations = results.filter((loc): loc is Location => loc !== null);
                
                log(`[Search] Found ${locations.length} matching locations across cities`);
            }
        }
        
        // If it's a "latest" query, we need to get the most recent meeting date
        if (extractedFilters.isLatest && extractedFilters.cityIds?.length === 1) {
            const latestMeeting = await prisma.councilMeeting.findFirst({
                where: {
                    cityId: extractedFilters.cityIds[0]
                },
                orderBy: {
                    dateTime: 'desc'
                }
            });

            if (latestMeeting) {
                extractedFilters.dateRange = {
                    start: latestMeeting.dateTime.toISOString(),
                    end: latestMeeting.dateTime.toISOString()
                };
                log('[Search] Set date range for latest meeting:', extractedFilters.dateRange);
            }
        }

        // Merge with explicit filters
        const mergedRequest: SearchRequest = {
            ...request,
            cityIds: extractedFilters.cityIds || request.cityIds,
            dateRange: extractedFilters.dateRange || request.dateRange,
            locations: locations.length > 0 ? locations : request.locations
        };
        log('[Search] Merged request:', mergedRequest);

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
                                                    query: mergedRequest.query,
                                                    fields: [
                                                        'public_subject_name^4',           // Highest boost - most important identifier
                                                        'public_subject_description^3',    // High boost - detailed content
                                                        ...(extractedFilters.locationName ? ['public_subject_location_text^3'] : []), // Add location text with high boost when location is extracted
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
                                                                            query: mergedRequest.query,
                                                                            boost: 2
                                                                        }
                                                                    }
                                                                },
                                                                {
                                                                    match: {
                                                                        'public_subject_speaker_segments.summary': {
                                                                            query: mergedRequest.query,
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
                                        filter: buildFilters(mergedRequest)
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
                                                        query: mergedRequest.query,
                                                        field: 'public_subject_description.semantic'
                                                    }
                                                }
                                            ],
                                            filter: buildFilters(mergedRequest)
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
        const results = await Promise.all(
            (response.hits.hits as Array<estypes.SearchHit<SubjectDocument>>).map(async (hit, index) => {
                if (!hit._source) {
                    logEssential('[Search] Invalid hit source', { index, score: hit._score });
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
                        },
                        highlights: true
                    }
                });

                if (!subject) {
                    logEssential('[Search] Subject not found', { 
                        subjectId: hit._source.public_subject_id,
                        score: hit._score 
                    });
                    throw new Error(`Subject ${hit._source.public_subject_id} not found`);
                }

                // Get location coordinates if available
                let locationWithCoordinates: LocationWithCoordinates | null = null;
                if (subject.location) {
                    const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
                        SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                        FROM "Location"
                        WHERE id = ${subject.location.id}
                        AND type = 'point'
                    `;

                    if (locationCoordinates.length > 0) {
                        locationWithCoordinates = {
                            ...subject.location,
                            coordinates: {
                                x: locationCoordinates[0].x,
                                y: locationCoordinates[0].y
                            }
                        };
                    }
                }

                // Process inner hits for speaker segments
                const matchedSpeakerSegmentIds = hit.inner_hits?.['public_subject_speaker_segments']?.hits?.hits
                    .map(innerHit => innerHit._source?.segment_id)
                    .filter((id): id is string => id !== undefined);

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
