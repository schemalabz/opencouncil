import { estypes } from '@elastic/elasticsearch';
import { SearchRequest, ExtractedFilters } from './types';
import { env } from '@/env.mjs';
import { ADMIN_BODY_TIER } from '@/lib/ranking/subjects';

const DEFAULT_RANK_WINDOW_SIZE = 100;
const DEFAULT_RANK_CONSTANT = 60;

const SEMANTIC_NAME_BOOST = 2.0;
const SEMANTIC_DESCRIPTION_BOOST = 1.5;

/**
 * Raw-score cutoff for the semantic retriever, measured against the production
 * index (scripts/search-eval.ts). multilingual-e5 trains with a low InfoNCE
 * temperature, so its cosine similarities bunch up near the top of the range
 * and unrelated text still scores highly. Measured bands (Aug 2026, 9.1k
 * released docs):
 *   - on-topic queries, top hits:        3.25 - 3.31
 *   - paraphrase queries (no shared
 *     stems with the docs), top hits:    3.23 - 3.275
 *   - off-topic queries, best hit:       <= 3.218
 * The cutoff sits just above the off-topic band and below the paraphrase band:
 * paraphrases are the semantic retriever's whole purpose (the lexical
 * retriever already covers stem-sharing queries), so the cutoff keeps them
 * while off-topic queries return zero semantic hits.
 *
 * The value is the sum of the two boosts below at their per-field score, so
 * recalibrate it whenever those boosts or the inference model change. Do not
 * normalize before applying it: `minmax` maps the best hit to exactly 1.0 for
 * every query, which makes a fractional cutoff unable to ever empty the results.
 */
const DEFAULT_SEMANTIC_MIN_SCORE = 3.23;

/**
 * A single-term query matches on its term; a 2-term query requires both terms
 * (ES's combination form treats clause counts <= the leading integer as
 * all-required); a query of 3+ terms requires 75% of them, so a single stray
 * matching term no longer surfaces a low-relevance hit. Requiring both terms
 * of a 2-term query is deliberate: measured on the production index, OR-ing
 * them floods the results with one-word matches (a query like "πάρκα Κυψέλης"
 * would surface every park in every city), while requiring both keeps the
 * results on-subject. Stopwords do not count: the greek analyzer drops them
 * before this applies, so "συνταγή για μουσακά" is a 2-term query.
 */
const LEXICAL_MINIMUM_SHOULD_MATCH = '2<75%';

/**
 * Typo tolerance is restricted to the name field, exact-only elsewhere.
 * Measured on the production index: fuzziness on description let off-topic
 * queries through, because long descriptions offer a large surface of terms
 * one edit away from a query's stems ("lava" matched a French description via
 * "lave"; "συνταγή"/"μουσακά" matched "συντήρηση"/"μουσική" descriptions).
 * Names are short keyword summaries, so a fuzzy match there has to line up
 * with what the subject is actually about — and a real typo query still
 * recovers, since anything worth finding carries its key terms in the name.
 *
 * AUTO:4,10 = 1 edit for terms of 4-9 chars, 2 edits only at 10+. The default
 * AUTO allows 2 edits from 6 chars up, which is too loose for Greek: stemmed
 * words are mostly 5-9 chars and 2 edits conflate unrelated stems
 * (συνταγ -> συντηρ). prefix_length 2 avoids noisy 1-char-prefix expansions.
 */
const NAME_FUZZINESS = 'AUTO:4,10';
const NAME_FUZZY_PREFIX_LENGTH = 2;
const NAME_FUZZY_BOOST = 1;

/**
 * Post-relevance ranking: nudges among otherwise-similar matches by administrative
 * body, discussion length, and recency. All three combine into one multiplier via a
 * script so their spreads stay comparable and legible from the constants below,
 * rather than depending on the native (and very different) scales of built-in
 * function_score functions like field_value_factor and decay functions.
 */

// Council meetings usually carry city-wide decisions, committees narrower ones,
// communities the smallest scope. This only nudges among otherwise-similar
// matches — a clearly better text match still wins regardless of body type.
//
// The council > committee > community ordering itself comes from ADMIN_BODY_TIER
// in src/lib/ranking/subjects.ts — the app's single standard subject-importance
// ranking (meeting cards, the meeting dashboard, list_hot_subjects, …) — so search
// and that ranking agree on which body type outranks which. Only the tier order is
// shared, not the whole formula: subjects.ts z-scores an already-fetched in-memory
// batch, which isn't something a per-document Elasticsearch script can do (there is
// no "the rest of the result set" to compare against at scoring time), so this
// scales the same tiers into a small multiplicative boost instead.
const ADMIN_BODY_BOOST_WEIGHT = 0.15;
const ADMIN_BODY_WEIGHT = {
    council: 1 + ADMIN_BODY_BOOST_WEIGHT * ADMIN_BODY_TIER.council,
    committee: 1 + ADMIN_BODY_BOOST_WEIGHT * ADMIN_BODY_TIER.committee,
    community: 1 + ADMIN_BODY_BOOST_WEIGHT * ADMIN_BODY_TIER.community,
} as const;
// No administrative body assigned ranks like the lowest tier (community), not the
// best one — never below the floor of 1.0 (no penalty), just no boost.
const DEFAULT_ADMIN_BODY_WEIGHT = 1 + ADMIN_BODY_BOOST_WEIGHT * ADMIN_BODY_TIER.community;

// log1p(minutes) keeps a subject the council spent an hour on from dominating one
// that got a brief mention. At this weight an hour-long discussion nets roughly
// +12% over one barely discussed at all. Reuses discussion_speaking_seconds
// (already indexed on SubjectSearchView for score rescoring), not a meeting-wide
// duration — a subject's own discussion length, not the whole session's.
const DISCUSSION_LENGTH_BOOST_WEIGHT = 0.03;

// Exponential decay: at RECENCY_DECAY_SCALE_DAYS old, a meeting keeps ~37% (1/e) of
// the recency boost. The multiplier floors at 1.0 (no boost), never goes below it —
// an old meeting loses the recency edge, it isn't penalized for its age.
const RECENCY_BOOST_WEIGHT = 0.1;
const RECENCY_DECAY_SCALE_DAYS = 365;

const RANKING_SCRIPT = `
    String bodyType = doc['administrative_body_type'].size() == 0 ? '' : doc['administrative_body_type'].value;
    double adminWeight = bodyType == 'council' ? params.councilWeight
        : bodyType == 'committee' ? params.committeeWeight
        : bodyType == 'community' ? params.communityWeight
        : params.defaultAdminBodyWeight;

    double discussionMinutes = doc['discussion_speaking_seconds'].size() == 0 ? 0 : doc['discussion_speaking_seconds'].value / 60.0;
    double discussionFactor = 1 + params.discussionWeight * Math.log1p(discussionMinutes);

    // A missing meeting_date is neutral (factor 1), like the other two signals
    // above — not the same as ageDays=0, which would be the *maximum* possible
    // recency boost (a meeting happening right now).
    double recencyFactor = 1.0;
    if (doc['meeting_date'].size() != 0) {
        double ageDays = (params.nowMillis - doc['meeting_date'].value.toInstant().toEpochMilli()) / 86400000.0;
        recencyFactor = 1 + params.recencyWeight * Math.exp(-Math.max(ageDays, 0) / params.recencyScaleDays);
    }

    return adminWeight * discussionFactor * recencyFactor;
`;

// nowMillis is threaded in explicitly (computed once by the caller) rather than
// read here via Date.now(), so every ranking function built for the same request —
// both RRF retrievers, or the filter-only branch — scores recency against the
// same instant.
function buildRankingFunction(nowMillis: number): estypes.QueryDslFunctionScoreContainer {
    return {
        script_score: {
            script: {
                source: RANKING_SCRIPT,
                params: {
                    councilWeight: ADMIN_BODY_WEIGHT.council,
                    committeeWeight: ADMIN_BODY_WEIGHT.committee,
                    communityWeight: ADMIN_BODY_WEIGHT.community,
                    defaultAdminBodyWeight: DEFAULT_ADMIN_BODY_WEIGHT,
                    discussionWeight: DISCUSSION_LENGTH_BOOST_WEIGHT,
                    recencyWeight: RECENCY_BOOST_WEIGHT,
                    recencyScaleDays: RECENCY_DECAY_SCALE_DAYS,
                    nowMillis,
                },
            },
        },
    };
}

// Wraps a query with the ranking function. `multiply` nudges an existing relevance
// score; a filter-only query (no should/must clauses) scores every hit 0, so the
// browse path (no query text) uses `replace` to rank on the function alone.
function applyRanking(
    query: estypes.QueryDslQueryContainer,
    boostMode: 'multiply' | 'replace',
    nowMillis: number
): estypes.QueryDslQueryContainer {
    return {
        function_score: {
            query,
            functions: [buildRankingFunction(nowMillis)],
            boost_mode: boostMode,
        },
    };
}

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
// Boost 1 keeps the field tier name > description > transcript: a transcript is
// the noisiest field (routine words like "προϋπολογισμός" occur in almost every
// meeting's discussion), so a transcript-only match must rank below subjects
// that carry the query terms in their name or description.
function buildTranscriptMatch(field: string, queryText: string): estypes.QueryDslQueryContainer {
    return {
        match: {
            [field]: {
                query: queryText,
                boost: 1,
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
                minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
            }
        },
        {
            // Typo tolerance for citizen-style queries (often misspelled), on the
            // name field only — see NAME_FUZZINESS for why description is exact-only.
            // Low boost: for correctly-spelled queries this adds near-uniform score
            // (a fuzzy expansion includes the exact term), so the exact clauses above
            // stay dominant; for typo queries it is the only clause that matches.
            match: {
                'name': {
                    query: queryText,
                    fuzziness: NAME_FUZZINESS,
                    prefix_length: NAME_FUZZY_PREFIX_LENGTH,
                    boost: NAME_FUZZY_BOOST,
                    minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
                }
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
    semanticMinScore: number,
    nowMillis: number
): estypes.RetrieverContainer {
    const semanticQuery: estypes.QueryDslQueryContainer = {
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
    };

    return {
        standard: {
            // The cutoff must see the raw semantic score, not the ranking-boosted one:
            // applyRanking's factors only ever scale a score up (they floor at 1.0), so
            // cutting off after boosting would let hits that boosting alone pushed above
            // semanticMinScore slip through, undermining the calibration this cutoff
            // exists for. Nesting a min_score-only function_score inside applyRanking's
            // wrapper cuts off on the raw score first, then re-ranks the survivors.
            query: applyRanking(
                { function_score: { query: semanticQuery, min_score: semanticMinScore } },
                'multiply',
                nowMillis
            )
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
    // retrievers (they require a query) and rank the filtered set by administrative
    // body, discussion length, and recency alone. Used e.g. for "everything a person
    // spoke about" or "all subjects in a date range".
    const queryText = mergedRequest.query?.trim();
    const filters = buildFilters(mergedRequest);
    // Computed once so every ranking function built for this request — both RRF
    // retrievers below, or the filter-only branch — scores recency identically.
    const nowMillis = Date.now();
    if (!queryText) {
        return {
            index: env.ELASTICSEARCH_INDEX,
            size: request.config?.size || 10,
            from: request.config?.from || 0,
            track_total_hits: true,
            // A filter-only bool query scores every hit 0, so 'replace' ranks on the
            // function alone instead of nudging a (nonexistent) relevance score.
            query: applyRanking({ bool: { filter: filters } }, 'replace', nowMillis)
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
                            query: applyRanking({
                                bool: {
                                    should: buildLexicalShouldClauses(queryText, extractedFilters),
                                    minimum_should_match: 1,
                                    filter: filters
                                }
                            }, 'multiply', nowMillis)
                        }
                    },
                    ...(request.config?.enableSemanticSearch ? [
                        buildSemanticRetriever(
                            queryText,
                            filters,
                            request.config.semanticMinScore ?? DEFAULT_SEMANTIC_MIN_SCORE,
                            nowMillis
                        )
                    ] : [])
                ],
                rank_window_size: request.config?.rankWindowSize || DEFAULT_RANK_WINDOW_SIZE,
                rank_constant: request.config?.rankConstant || DEFAULT_RANK_CONSTANT
            }
        }
    };
}
