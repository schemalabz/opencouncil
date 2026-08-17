import { estypes } from '@elastic/elasticsearch';
import { SearchRequest, ExtractedFilters } from './types';
import { env } from '@/env.mjs';

const DEFAULT_RANK_WINDOW_SIZE = 100;
const DEFAULT_RANK_CONSTANT = 60;

const SEMANTIC_NAME_BOOST = 2.0;
const SEMANTIC_DESCRIPTION_BOOST = 1.5;

/**
 * Raw-score cutoff for the semantic retriever, measured against the production
 * index. multilingual-e5 trains with a low InfoNCE temperature, so its cosine
 * similarities bunch up near the top of the range and unrelated text still
 * scores highly: over a 32-query sample, off-topic queries peaked at 3.198 and
 * on-topic ones bottomed out at 3.174. The cutoff sits just above the off-topic
 * band; the lexical retriever covers the on-topic queries that fall below it.
 *
 * The value is the sum of the two boosts below at their per-field score, so
 * recalibrate it whenever those boosts or the inference model change. Do not
 * normalize before applying it: `minmax` maps the best hit to exactly 1.0 for
 * every query, which makes a fractional cutoff unable to ever empty the results.
 */
const DEFAULT_SEMANTIC_MIN_SCORE = 3.2;

/**
 * Leave 1- and 2-term queries at full recall (nothing required); for 3+ term
 * queries require 75% of terms so a single stray matching term no longer
 * surfaces a low-relevance hit. ES notation: "2<75%" = full recall when <=2
 * terms, 75% required once the term count exceeds 2 (i.e. 3 or more).
 */
const LEXICAL_MINIMUM_SHOULD_MATCH = '2<75%';

// Build filters for the search query
export function buildFilters(request: SearchRequest): estypes.QueryDslQueryContainer[] {
    const filters: estypes.QueryDslQueryContainer[] = [];

    // Always filter for released meetings only
    filters.push({
        term: {
            'meeting_released': true
        }
    });

    // Add city filter if specified
    if (request.cityIds && request.cityIds.length > 0) {
        filters.push({
            terms: {
                'city_id': request.cityIds
            }
        });
    }

    // Add person filter if specified.
    // A subject is relevant to a person if they EITHER introduced it OR spoke in it.
    // These two clauses must be OR-combined inside a single `bool.should`; pushing
    // them as separate entries in the top-level `filter` array would AND them, which
    // almost never matches (the person rarely both introduces and speaks in the same
    // subject) and breaks search on every person profile page.
    if (request.personIds && request.personIds.length > 0) {
        filters.push({
            bool: {
                should: [
                    // Introduced by the person
                    {
                        terms: {
                            'introduced_by_person_id': request.personIds
                        }
                    },
                    // Spoke in the subject (nested speaker contributions)
                    {
                        nested: {
                            path: 'speaker_contributions',
                            query: {
                                terms: {
                                    'speaker_contributions.speaker_person_id': request.personIds
                                }
                            }
                        }
                    }
                ],
                minimum_should_match: 1
            }
        });
    }

    // Add party filter if specified
    if (request.partyIds && request.partyIds.length > 0) {
        filters.push({
            terms: {
                'introduced_by_party_id': request.partyIds
            }
        });
    }

    // Add topic filter if specified
    if (request.topicIds && request.topicIds.length > 0) {
        filters.push({
            terms: {
                'topic_id': request.topicIds
            }
        });
    }

    // Add date range filter if specified
    if (request.dateRange) {
        filters.push({
            range: {
                'meeting_date': {
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
                    'location_geojson': {
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
                            'location_geojson': {
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

// Transcripts are long enough that a bare OR match lets an off-topic query match
// on one common word, so they take the same term requirement as the title fields.
function buildTranscriptMatch(field: string, queryText: string): estypes.QueryDslQueryContainer {
    return {
        match: {
            [field]: {
                query: queryText,
                boost: 2,
                minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
            }
        }
    };
}

// Lexical should-clauses: BM25 match on title/description/transcripts.
function buildLexicalShouldClauses(
    queryText: string,
    extractedFilters: ExtractedFilters
): estypes.QueryDslQueryContainer[] {
    return [
        {
            multi_match: {
                query: queryText,
                fields: [
                    'name^4',
                    'description^3',
                    ...(extractedFilters.locationName ? ['location_text^3'] : []),
                ],
                type: 'best_fields',
                operator: 'or',
                // Typo tolerance for citizen-style queries (often misspelled).
                // prefix_length:2 avoids noisy 1-char-prefix expansions on Greek morphology.
                fuzziness: 'AUTO',
                prefix_length: 2,
                minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
            }
        },
        {
            // Phrase match on the title: a contiguous phrase match in the
            // most important field should clearly outrank scattered terms.
            match_phrase: {
                'name': {
                    query: queryText,
                    boost: 6
                }
            }
        },
        {
            // Phrase match on the description, with a lower boost than the
            // title so long descriptions don't overweight phrase proximity.
            match_phrase: {
                'description': {
                    query: queryText,
                    boost: 4
                }
            }
        },
        {
            nested: {
                path: 'speaker_contributions',
                query: buildTranscriptMatch('speaker_contributions.text', queryText),
                inner_hits: {
                    _source: ['speaker_contributions.contribution_id']
                }
            }
        }
    ];
}

// Semantic kNN returns nearest neighbours for every query, however unrelated,
// so without a cutoff an off-topic query still fills a page of results. The
// `min_score` drops the neighbours that only look close on the model's
// compressed similarity scale.
function buildSemanticRetriever(
    queryText: string,
    filters: estypes.QueryDslQueryContainer[],
    semanticMinScore: number
): estypes.RetrieverContainer {
    return {
        standard: {
            min_score: semanticMinScore,
            query: {
                bool: {
                    should: [
                        {
                            semantic: {
                                query: queryText,
                                field: 'name.semantic',
                                boost: SEMANTIC_NAME_BOOST
                            }
                        },
                        {
                            semantic: {
                                query: queryText,
                                field: 'description.semantic',
                                boost: SEMANTIC_DESCRIPTION_BOOST
                            }
                        }
                    ],
                    minimum_should_match: 1,
                    filter: filters
                }
            }
        }
    };
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

    // Filter-only search: no query text to rank on, so skip the rrf/semantic
    // retrievers (they require a query) and return the filtered set newest-first.
    // Used e.g. for "everything a person spoke about" or "all subjects in a
    // date range".
    const queryText = mergedRequest.query?.trim();
    const filters = buildFilters(mergedRequest);
    if (!queryText) {
        return {
            index: env.ELASTICSEARCH_INDEX,
            size: request.config?.size || 10,
            from: request.config?.from || 0,
            track_total_hits: true,
            query: {
                bool: {
                    filter: filters
                }
            },
            sort: [{ 'meeting_date': { order: 'desc' } }]
        };
    }

    return {
        index: env.ELASTICSEARCH_INDEX,
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
                                    should: buildLexicalShouldClauses(queryText, extractedFilters),
                                    minimum_should_match: 1,
                                    filter: filters
                                }
                            }
                        }
                    },
                    ...(request.config?.enableSemanticSearch ? [
                        buildSemanticRetriever(
                            queryText,
                            filters,
                            request.config.semanticMinScore ?? DEFAULT_SEMANTIC_MIN_SCORE
                        )
                    ] : [])
                ],
                rank_window_size: request.config?.rankWindowSize || DEFAULT_RANK_WINDOW_SIZE,
                rank_constant: request.config?.rankConstant || DEFAULT_RANK_CONSTANT
            }
        }
    };
}
