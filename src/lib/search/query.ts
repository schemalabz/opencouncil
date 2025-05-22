import { estypes } from '@elastic/elasticsearch';
import { SearchRequest, ExtractedFilters } from './types';

// Build filters for the search query
export function buildFilters(request: SearchRequest): estypes.QueryDslQueryContainer[] {
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

// Build the search query
export function buildSearchQuery(
    request: SearchRequest,
    extractedFilters: ExtractedFilters
): estypes.SearchRequest {
    const mergedRequest = {
        ...request,
        cityIds: extractedFilters.cityIds || request.cityIds,
        dateRange: extractedFilters.dateRange || request.dateRange
    };

    return {
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
}
