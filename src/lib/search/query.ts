import { estypes } from '@elastic/elasticsearch';
import { SearchRequest, ExtractedFilters, Location } from './types';
import { env } from '@/env.mjs';
import { ADMIN_BODY_TIER } from '@/lib/ranking/subjects';

const SEMANTIC_NAME_BOOST = 2.0;
const SEMANTIC_DESCRIPTION_BOOST = 1.5;

// Additive score for subjects pinned within an AI-extracted location's radius
// (see buildLocationBoostClauses). Small next to the name/description boosts:
// proximity breaks ties among text matches, it does not outrank a better text
// match.
const LOCATION_BOOST = 2;

/**
 * Raw-score cutoff for the semantic fallback clause, measured against the production
 * index (scripts/search-eval.ts). multilingual-e5 trains with a low InfoNCE
 * temperature, so its cosine similarities bunch up near the top of the range
 * and unrelated text still scores highly. Measured bands (Aug 2026, 9.1k
 * released docs):
 *   - on-topic queries, top hits:        3.25 - 3.31
 *   - paraphrase queries (no shared
 *     stems with the docs), top hits:    3.23 - 3.275
 *   - off-topic queries, best hit:       <= 3.218
 * The cutoff sits just above the off-topic band and below the paraphrase band:
 * paraphrases are the semantic clause's whole purpose (the lexical clauses
 * already cover stem-sharing queries), so the cutoff keeps them
 * while off-topic queries return zero semantic hits.
 *
 * The value is the sum of the two boosts below at their per-field score, so
 * recalibrate it whenever those boosts or the inference model change. Do not
 * normalize before applying it: `minmax` maps the best hit to exactly 1.0 for
 * every query, which makes a fractional cutoff unable to ever empty the results.
 */
const DEFAULT_SEMANTIC_MIN_SCORE = 3.23;

/**
 * Mapping of the raw semantic score into BM25 space for the dis_max fallback
 * (see buildSemanticFallbackQuery): mapped = BASE + (raw - cutoff) * SCALE.
 * Calibrated against the flattened lexical tiers (FIELD_TIER) on the
 * live-index eval (scripts/search-eval.ts):
 *   - Weak stem-coincidence lexical matches (both stems of a 2-term query
 *     landing in one long description, e.g. bar licenses matching
 *     "ζώα χωρίς ιδιοκτήτη" via ζω/ιδιοκτητ) flatten to ~24-30
 *     (descriptionTerm + descriptionPhrase bands); BASE sits inside that
 *     band, so a genuine paraphrase-only match competes with them.
 *   - A real name match flattens to ~58+ (nameTerm + namePhrase), so the
 *     mapped ceiling (BASE + ~0.08 * SCALE ≈ 34) stays below any title match.
 *   - The paraphrase band spans ~cutoff to cutoff + 0.08 (e5's compressed
 *     scale); SCALE spreads it over ~8 points so semantic ordering still
 *     matters among paraphrase-only hits.
 */
const SEMANTIC_MAPPED_BASE = 26;
const SEMANTIC_MAPPED_SCALE = 100;

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
 * Apostrophe-like characters normalized to the ASCII apostrophe before any
 * clause sees the query: the single quotes mobile keyboards auto-substitute
 * (U+2018/U+2019), the modifier apostrophe (U+02BC), the Greek tonos (U+0384)
 * and acute accent (U+00B4) that official minutes use as apostrophes in names
 * like ΔΙ΄ΕΥΧΩΝ, and the Greek koronis/psili (U+1FBD/U+1FBF). Without this,
 * the same query succeeds or fails depending on which keyboard typed it.
 */
const APOSTROPHE_VARIANTS = /[‘’ʼ΄´᾽᾿]/g;

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

/**
 * A person-name query answers with the subjects the person is responsible for
 * (FIELD_TIER.introducer). The subjects they only spoke in answer the same
 * query weakly, so they belong in the tail: the speakerName tier is the
 * lowest in the query, under the transcript's.
 *
 * The boost decides only where those subjects rank, never whether they are
 * found — a should-clause either matches or it does not. Measured on the
 * production index (Aug 2026, 9.1k released docs), the recall it adds is the
 * point of the clause, and it is the same at every boost:
 *   "Χάρης Δούκας"  38 -> 110 hits    "Μαλτέζος"  120 -> 216
 *   "του Δούκα"     94 -> 154         topic queries: no change at all
 * Junk queries stay empty, because no name matches their terms.
 *
 * The speakerName tier in FIELD_TIER is calibrated on how far the clause may
 * reorder the first page (measured at the pre-tier boost 0.1, re-checked after
 * the tier flattening): for the worst case in the index — an Athens mayor who
 * speaks in 91 subjects and introduced 34 — it moves 2 subjects into the top
 * 10; every other measured query moves 0-1. Two slots on the single heaviest
 * speaker is the intended dose: the page still leads with what the person
 * introduced, and the rest of what they spoke in follows behind it.
 *
 * The earlier decision here was to leave the field unsearched, on the reasoning
 * that a mayor speaks in nearly every subject. The measurements above do not
 * support that: a speaker reaches 2-3x the subjects they introduce, not the
 * whole index, because a subject only carries contributions once the summarize
 * task has run on it. The personIds filter is still the right tool for
 * "everything this person spoke about" — it is exact, and it does not rank.
 */

/**
 * Field-tier score flattening: every lexical clause is rescored to
 * base + k * log1p(bm25), so WHICH field matched (the tier: name >
 * description/introducer > transcript > speaker name) sets the score level,
 * raw BM25 shrinks to a small within-tier tiebreak, and the post-relevance
 * multiplier (admin body, discussion length, recency; up to ~1.42x) decides
 * among same-tier matches.
 *
 * Raw BM25 must not rank within a tier: measured on the production index
 * ("δάνειο"), two title matches differed by 26% in summed BM25 purely through
 * title length normalization (3 vs 4 stemmed tokens) and description term
 * repetition — noise, not relevance — which buried a recent, heavily-debated
 * subject under an old, briefly-discussed one. Under the flattening the same
 * pair differs by ~2% before the multiplier, so recency and discussion decide.
 *
 * Tier levels are chosen so the multiplier can reorder within a tier but not
 * across tiers: a full name match (term+phrase, ~58-88 with its log parts)
 * stays above the strongest boosted description match (~30 * 1.42 = 43); a
 * description match stays above transcript-only (~16 * 1.42 = 23). The
 * semantic fallback maps into the description band (see SEMANTIC_MAPPED_BASE).
 * k per tier keeps the log tiebreak's spread near +-5%, well under the
 * multiplier's reach.
 */
const FIELD_TIER = {
    nameTerm: { base: 40, k: 6 },
    namePhrase: { base: 20, k: 3 },
    descriptionTerm: { base: 15, k: 4 },
    descriptionPhrase: { base: 8, k: 2 },
    // Between name and description: for a person-name query, the subjects the
    // person introduced must lead the ones that only mention them in the
    // description or transcript (there is no title to compete with — names
    // rarely appear in subject titles), while for topic queries a real title
    // match still outranks a same-named introducer (stem collisions like
    // Δήμος the surname vs δήμος the word).
    introducer: { base: 28, k: 4 },
    locationText: { base: 15, k: 4 },
    // Uniform for correctly-spelled queries (a fuzzy expansion includes the
    // exact term), the only name-tier signal for typo queries.
    fuzzyName: { base: 4, k: 2 },
    transcript: { base: 6, k: 3 },
    speakerName: { base: 0.3, k: 0.2 },
} as const;

// Rescores a clause to its tier band: base + k * log1p(bm25). boost_mode
// replace discards the raw BM25 magnitude; the log term keeps its ordering as
// a within-tier tiebreak. Wrapping OUTSIDE a nested query preserves inner_hits.
function flattenToTier(
    query: estypes.QueryDslQueryContainer,
    tier: { base: number; k: number }
): estypes.QueryDslQueryContainer {
    return {
        function_score: {
            query,
            functions: [
                {
                    script_score: {
                        script: {
                            source: 'params.base + params.k * Math.log1p(_score)',
                            params: { base: tier.base, k: tier.k }
                        }
                    }
                }
            ],
            boost_mode: 'replace'
        }
    };
}

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

function buildRankingFunction(): estypes.QueryDslFunctionScoreContainer {
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
                    nowMillis: Date.now(),
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
    boostMode: 'multiply' | 'replace'
): estypes.QueryDslQueryContainer {
    return {
        function_score: {
            query,
            functions: [buildRankingFunction()],
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

    return filters;
}

// Location proximity clauses. Only the AI filter-extraction path produces
// `locations` (no UI, API or MCP caller passes them). They must NOT become a
// hard filter on a text search: only ~45% of subjects carry a location pin,
// and a geo_distance filter drops every pin-less document. A query like
// "παλαιστίνη" — extracted as a location and geocoded somewhere — would then
// return zero results even though subjects carry it in the title. As `should`
// clauses on the scoring query, nearby pinned subjects rank higher and
// everything else still matches on text alone.
function buildLocationBoostClauses(locations: Location[] | undefined): estypes.QueryDslQueryContainer[] {
    if (!locations || locations.length === 0) return [];
    return locations.map(loc => ({
        geo_distance: {
            distance: `${loc.radius}km`,
            'location_geojson': {
                lat: loc.point.lat,
                lon: loc.point.lon
            },
            boost: LOCATION_BOOST
        }
    }));
}

// Transcripts are long enough that a bare OR match lets an off-topic query match
// on one common word, so they take the same term requirement as the title fields.
// The transcript's place at the bottom of the field tier (a transcript is the
// noisiest field — routine words like "προϋπολογισμός" occur in almost every
// meeting's discussion) comes from FIELD_TIER.transcript on the wrapper, not
// from a boost here.
function buildTranscriptMatch(field: string, queryText: string): estypes.QueryDslQueryContainer {
    return {
        match: {
            [field]: {
                query: queryText,
                minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
            }
        }
    };
}

// The standard tokenizer keeps an intra-word ASCII apostrophe inside its
// token (δι'ευχών → δι'ευχ) but splits on the Greek tonos that official
// minutes use in names (ΔΙ΄ΕΥΧΩΝ → δι, ευχ), so each indexed spelling is
// reachable by only one shape of the query. The main clauses match the
// intact-token form; the space-split variant matches the split-token form.
function buildQueryTextVariants(queryText: string): string[] {
    return queryText.includes("'") ? [queryText.replace(/'/g, ' ')] : [];
}

// Lexical should-clauses: BM25 match on title/description/transcripts.
function buildLexicalShouldClauses(
    queryText: string,
    extractedFilters: ExtractedFilters
): estypes.QueryDslQueryContainer[] {
    // Name and description sit in different tiers, so each field gets its own
    // clause (a shared best_fields multi_match could not carry two bases).
    // Matching several fields sums their tiers — more evidence, higher score —
    // which preserves the old multi_match-plus-phrases additivity.
    const termClause = (field: string, text: string): estypes.QueryDslQueryContainer => ({
        match: {
            [field]: {
                query: text,
                minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
            }
        }
    });

    return [
        // One clause pair per alternate spelling (see buildQueryTextVariants),
        // in the same tiers as the main clauses: whichever shape the index
        // holds, the score tier is the same.
        ...buildQueryTextVariants(queryText).flatMap(variant => [
            flattenToTier(termClause('name', variant), FIELD_TIER.nameTerm),
            flattenToTier(termClause('description', variant), FIELD_TIER.descriptionTerm),
        ]),
        flattenToTier(termClause('name', queryText), FIELD_TIER.nameTerm),
        flattenToTier(termClause('description', queryText), FIELD_TIER.descriptionTerm),
        // Person-name queries ("Χάρης Δούκας", "Μαλτέζος") are a recurring
        // pattern in the logged user searches. This field covers the subjects
        // the person introduced — the strongest authorship signal. The subjects
        // they only spoke in match through the much weaker nested speaker-name
        // clause below. The greek analyzer also stems name declensions, so
        // "του Δούκα" matches "Δούκας".
        flattenToTier(termClause('introduced_by_person_name', queryText), FIELD_TIER.introducer),
        ...(extractedFilters.locationName
            ? [flattenToTier(termClause('location_text', queryText), FIELD_TIER.locationText)]
            : []),
        // Typo tolerance for citizen-style queries (often misspelled), on the
        // name field only — see NAME_FUZZINESS for why description is exact-only.
        // For correctly-spelled queries this adds a near-uniform tier score (a
        // fuzzy expansion includes the exact term); for typo queries it is the
        // only clause that matches.
        flattenToTier({
            match: {
                'name': {
                    query: queryText,
                    fuzziness: NAME_FUZZINESS,
                    prefix_length: NAME_FUZZY_PREFIX_LENGTH,
                    minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
                }
            }
        }, FIELD_TIER.fuzzyName),
        // Phrase match on the title: a contiguous phrase match in the most
        // important field should clearly outrank scattered terms.
        flattenToTier({
            match_phrase: {
                'name': { query: queryText }
            }
        }, FIELD_TIER.namePhrase),
        // Phrase match on the description, a tier below the title phrase so
        // long descriptions don't overweight phrase proximity.
        flattenToTier({
            match_phrase: {
                'description': { query: queryText }
            }
        }, FIELD_TIER.descriptionPhrase),
        flattenToTier({
            nested: {
                path: 'speaker_contributions',
                query: buildTranscriptMatch('speaker_contributions.text', queryText),
                inner_hits: {
                    _source: ['speaker_contributions.contribution_id']
                }
            }
        }, FIELD_TIER.transcript),
        // Subjects the person spoke in, at the bottom of the field tier (see
        // FIELD_TIER.speakerName and the calibration note above it). A separate
        // nested clause rather than a second field on the transcript clause
        // above: inner_hits marks which contributions matched the query text,
        // and a speaker-name match would add contributions whose text does not
        // contain the query at all.
        flattenToTier({
            nested: {
                path: 'speaker_contributions',
                query: {
                    match: {
                        'speaker_contributions.speaker_person_name': {
                            query: queryText,
                            minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
                        }
                    }
                }
            }
        }, FIELD_TIER.speakerName)
    ];
}

// Semantic kNN returns nearest neighbours for every query, however unrelated,
// so without a cutoff an off-topic query still fills a page of results. The
// `min_score` drops the neighbours that only look close on the model's
// compressed similarity scale.
//
// This is one side of a dis_max with the lexical clauses (score = max, not
// sum), NOT a second retriever fused with rank-based RRF, and NOT an additive
// clause. Both alternatives failed on measured cases:
//   - RRF double-counted whichever document happened to clear the cutoff
//     (a second reciprocal-rank vote, worth ~2x), so a 4-minute loan
//     discussion outranked a 139-minute one whose semantic score fell just
//     below the cutoff ("δάνειο", lexical gap between them only ~2%).
//   - An additive bonus cannot be sized at all: lexical scores of strong
//     matches sit ~2 points apart while weak-but-junky lexical matches score
//     20-40, so any bonus big enough to lift a paraphrase-only match over
//     junk would also flip the strong matches.
// Under dis_max the semantic path is mapped into the description-tier score
// range (SEMANTIC_MAPPED_BASE + margin * SEMANTIC_MAPPED_SCALE) and max()
// structurally caps its power: a document with a strong lexical score keeps
// it unchanged, a paraphrase-only document enters at description strength —
// above transcript-only mentions and weak stem-coincidence matches, below
// any real name match. Off-topic queries still return nothing: below the
// cutoff the mapped score falls under min_score and the clause does not
// match, and the lexical side never matched in the first place.
function buildSemanticFallbackQuery(
    queryText: string,
    semanticMinScore: number
): estypes.QueryDslQueryContainer {
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
            minimum_should_match: 1
        }
    };

    return {
        function_score: {
            query: semanticQuery,
            functions: [
                {
                    script_score: {
                        script: {
                            // Clamped at 0 because Elasticsearch rejects negative
                            // script scores outright: a hit matching only one
                            // semantic field scores far below the cutoff (raw ~1.8
                            // maps to ~-214) and would fail the whole request, not
                            // just miss min_score. The clamp keeps the score legal;
                            // min_score below still does the actual gating.
                            source: 'Math.max(params.base + (_score - params.cutoff) * params.scale, 0)',
                            params: {
                                base: SEMANTIC_MAPPED_BASE,
                                cutoff: semanticMinScore,
                                scale: SEMANTIC_MAPPED_SCALE
                            }
                        }
                    }
                }
            ],
            boost_mode: 'replace',
            // min_score applies to the adjusted score: raw scores below the
            // cutoff map below `base` and are dropped, keeping the
            // zero-results behaviour for off-topic queries.
            min_score: SEMANTIC_MAPPED_BASE
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

    // Filter-only search: no query text to rank on, so skip the text clauses
    // (they require a query) and rank the filtered set by administrative body,
    // discussion length, and recency alone. Used e.g. for "everything a person
    // spoke about" or "all subjects in a date range".
    const queryText = mergedRequest.query?.trim().replace(APOSTROPHE_VARIANTS, "'");
    const filters = buildFilters(mergedRequest);
    const locationBoosts = buildLocationBoostClauses(mergedRequest.locations);
    if (!queryText) {
        // With no text to score, a location can only act as a filter. Unreachable
        // today (locations only come from AI extraction, which requires query
        // text), but kept so an explicit filter-only location request stays a
        // location browse rather than being ignored.
        const browseFilters = locationBoosts.length > 0
            ? [...filters, { bool: { should: locationBoosts, minimum_should_match: 1 } }]
            : filters;
        return {
            index: env.ELASTICSEARCH_INDEX,
            size: request.config?.size || 10,
            from: request.config?.from || 0,
            track_total_hits: true,
            // A filter-only bool query scores every hit 0, so 'replace' ranks on the
            // function alone instead of nudging a (nonexistent) relevance score.
            query: applyRanking({ bool: { filter: browseFilters } }, 'replace')
        };
    }

    // One scored query, no rank fusion: the lexical clauses sum inside their
    // own bool, and the semantic fallback competes with that sum via dis_max
    // (score = max) — see buildSemanticFallbackQuery for why neither RRF nor
    // an additive clause works. Filters wrap the dis_max so both sides stay
    // scoped identically.
    const lexicalBool: estypes.QueryDslQueryContainer = {
        bool: {
            should: buildLexicalShouldClauses(queryText, extractedFilters),
            minimum_should_match: 1
        }
    };
    const textCore: estypes.QueryDslQueryContainer = {
        bool: {
            must: [
                request.config?.enableSemanticSearch
                    ? {
                        dis_max: {
                            queries: [
                                lexicalBool,
                                buildSemanticFallbackQuery(
                                    queryText,
                                    request.config.semanticMinScore ?? DEFAULT_SEMANTIC_MIN_SCORE
                                )
                            ],
                            // Pure max: any tie_breaker share of the semantic score
                            // added onto near-tied strong lexical matches would
                            // reorder them (their gaps measure ~2%).
                            tie_breaker: 0
                        }
                    }
                    : lexicalBool
            ],
            filter: filters
        }
    };
    // Proximity lifts pinned subjects near the extracted location, inside `must`
    // so a location-only match without any text match cannot surface.
    const scoredQuery: estypes.QueryDslQueryContainer = locationBoosts.length > 0
        ? { bool: { must: [textCore], should: locationBoosts } }
        : textCore;

    return {
        index: env.ELASTICSEARCH_INDEX,
        size: request.config?.size || 10,
        from: request.config?.from || 0,
        track_total_hits: true,
        query: applyRanking(scoredQuery, 'multiply')
    };
}
