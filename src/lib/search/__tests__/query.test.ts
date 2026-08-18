import type { estypes } from '@elastic/elasticsearch';
import type { SearchRequest } from '../types';

// Avoid pulling the full env validation (createEnv) at import time; buildFilters
// itself does not read env, only the module-level import does.
jest.mock('@/env.mjs', () => ({ env: { ELASTICSEARCH_INDEX: 'test-index' } }));

import { buildFilters, buildSearchQuery } from '../query';
import type { ExtractedFilters } from '../types';

const NO_EXTRACTED_FILTERS: ExtractedFilters = {
    cityIds: null,
    dateRange: null,
    isLatest: null,
    locationName: null,
};

type BoolQuery = estypes.QueryDslBoolQuery;

// `match` accepts a shorthand value as well as the full object form, so narrow
// to the object form before reading minimum_should_match off it.
function minimumShouldMatchOf(
    clause: estypes.QueryDslQueryContainer | undefined
): string | number | undefined {
    const match = Object.values(clause?.match ?? {})[0];
    return typeof match === 'object' ? match.minimum_should_match : undefined;
}

// Every scoring query is wrapped in applyRanking's function_score. Unwrap it to
// reach the underlying query the rest of the tests assert against.
function unwrapRanking(
    query: estypes.QueryDslQueryContainer | undefined
): { inner: estypes.QueryDslQueryContainer; functionScore: estypes.QueryDslFunctionScoreQuery } {
    const functionScore = query?.function_score as estypes.QueryDslFunctionScoreQuery;
    return { inner: functionScore?.query as estypes.QueryDslQueryContainer, functionScore };
}

function findPersonFilter(
    filters: estypes.QueryDslQueryContainer[]
): estypes.QueryDslQueryContainer | undefined {
    // The person filter is the bool/should clause referencing introduced_by_person_id.
    // Use a structural lookup (not a JSON substring match) so the tests can't pass
    // vacuously if key ordering or the serialised shape changes.
    return filters.find(
        (f) =>
            Array.isArray(f.bool?.should) &&
            (f.bool!.should as estypes.QueryDslQueryContainer[]).some(
                (c) => c.terms?.['introduced_by_person_id'] !== undefined
            )
    );
}

describe('buildFilters person filter', () => {
    it('OR-combines introduced-by and spoke-in clauses (issue #373)', () => {
        const request: SearchRequest = { query: 'roads', personIds: ['p1'] };

        const filters = buildFilters(request);
        const personFilter = findPersonFilter(filters);

        expect(personFilter).toBeDefined();

        const bool = personFilter!.bool as BoolQuery;
        const should = (bool.should ?? []) as estypes.QueryDslQueryContainer[];

        // Single bool.should with both clauses, OR-combined.
        expect(bool.minimum_should_match).toBe(1);
        expect(should).toHaveLength(2);

        // Clause 1: introduced by the person.
        const introducedBy = should.find((c) => c.terms?.['introduced_by_person_id']);
        expect(introducedBy?.terms?.['introduced_by_person_id']).toEqual(['p1']);

        // Clause 2: spoke in the subject (nested speaker contributions).
        const spokeIn = should.find((c) => c.nested);
        expect(spokeIn?.nested?.path).toBe('speaker_contributions');
        expect(
            (spokeIn?.nested?.query as estypes.QueryDslQueryContainer).terms?.[
                'speaker_contributions.speaker_person_id'
            ]
        ).toEqual(['p1']);
    });

    it('does not split the person filter into two separate AND-combined top-level clauses', () => {
        const request: SearchRequest = { query: 'roads', personIds: ['p1'] };

        const filters = buildFilters(request);

        // Regression guard: the two person clauses must NOT appear as separate
        // top-level filter entries (that would AND them — the original bug).
        const topLevelIntroduced = filters.filter(
            (f) => f.terms?.['introduced_by_person_id']
        );
        const topLevelNested = filters.filter(
            (f) =>
                f.nested?.path === 'speaker_contributions' &&
                JSON.stringify(f).includes('speaker_person_id')
        );
        expect(topLevelIntroduced).toHaveLength(0);
        expect(topLevelNested).toHaveLength(0);
    });

    it('keeps person and party filters as independent top-level (AND) clauses', () => {
        const request: SearchRequest = {
            query: 'roads',
            personIds: ['p1'],
            partyIds: ['party1'],
        };

        const filters = buildFilters(request);

        expect(findPersonFilter(filters)).toBeDefined();
        const partyFilter = filters.find((f) => f.terms?.['introduced_by_party_id']);
        expect(partyFilter?.terms?.['introduced_by_party_id']).toEqual(['party1']);
    });

    it('omits the person filter entirely when no personIds are given', () => {
        const request: SearchRequest = { query: 'roads' };

        const filters = buildFilters(request);

        expect(findPersonFilter(filters)).toBeUndefined();
    });

    it('omits the person filter when personIds is an empty array', () => {
        const request: SearchRequest = { query: 'roads', personIds: [] };

        const filters = buildFilters(request);

        expect(findPersonFilter(filters)).toBeUndefined();
    });
});

describe('buildSearchQuery lexical ranking', () => {
    function lexicalShouldClauses(query: string): estypes.QueryDslQueryContainer[] {
        const q = buildSearchQuery({ query }, NO_EXTRACTED_FILTERS);
        const rrf = q.retriever?.rrf as estypes.RetrieverContainer['rrf'];
        const standard = rrf?.retrievers?.[0]?.standard as estypes.RetrieverContainer['standard'];
        const { inner } = unwrapRanking(standard?.query);
        const bool = inner?.bool as BoolQuery;
        return (bool.should ?? []) as estypes.QueryDslQueryContainer[];
    }

    it('nudges the lexical retriever score with the ranking function, multiplicatively', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);
        const rrf = q.retriever?.rrf as estypes.RetrieverContainer['rrf'];
        const standard = rrf?.retrievers?.[0]?.standard as estypes.RetrieverContainer['standard'];
        const { functionScore } = unwrapRanking(standard?.query);

        expect(functionScore.boost_mode).toBe('multiply');
        expect(functionScore.functions).toHaveLength(1);
    });

    it('applies an exact multi-match and phrase boosts on name and description', () => {
        const should = lexicalShouldClauses('πάρκα Κυψέλης');

        const multiMatch = should.find((c) => c.multi_match)?.multi_match;
        expect(multiMatch).toMatchObject({
            query: 'πάρκα Κυψέλης',
            type: 'best_fields',
            operator: 'or',
            minimum_should_match: '2<75%',
        });
        // introduced_by_person_name serves person-name queries (a recurring
        // pattern in logged user searches) via the subjects the person
        // introduced. speaker_contributions.speaker_person_name is deliberately
        // absent: a mayor speaks in nearly every subject, so matching it would
        // flood a name query (the personIds filter serves that need).
        expect(multiMatch?.fields).toEqual([
            'name^4',
            'description^3',
            'introduced_by_person_name^3',
        ]);
        // Regression: fuzziness on the multi-match let off-topic queries match
        // long descriptions through one-edit-away terms ("lava" matched a French
        // description via "lave"). Typo tolerance lives in the name-only clause.
        expect(multiMatch?.fuzziness).toBeUndefined();

        const namePhrase = should.find((c) => c.match_phrase?.['name']);
        expect(namePhrase?.match_phrase?.['name']).toEqual({
            query: 'πάρκα Κυψέλης',
            boost: 6,
        });

        const descriptionPhrase = should.find((c) => c.match_phrase?.['description']);
        expect(descriptionPhrase?.match_phrase?.['description']).toEqual({
            query: 'πάρκα Κυψέλης',
            boost: 4,
        });
    });

    it('restricts typo tolerance to a low-boost fuzzy match on the name field', () => {
        const should = lexicalShouldClauses('ανακίκλωση');

        const fuzzyName = should
            .map((c) => c.match?.['name'])
            .find((m) => typeof m === 'object' && m !== null && 'fuzziness' in m);
        expect(fuzzyName).toEqual({
            query: 'ανακίκλωση',
            // AUTO:4,10 = 1 edit for 4-9 char terms; the default AUTO's 2 edits
            // from 6 chars up conflates unrelated Greek stems (συνταγ -> συντηρ).
            fuzziness: 'AUTO:4,10',
            prefix_length: 2,
            boost: 1,
            minimum_should_match: '2<75%',
        });

        // No fuzzy clause on description — see the regression note above.
        expect(should.some((c) => {
            const desc = c.match?.['description'];
            return typeof desc === 'object' && desc !== null && 'fuzziness' in desc;
        })).toBe(false);
    });

    it('keeps inner_hits on the scoring lexical retriever', () => {
        const should = lexicalShouldClauses('πάρκα');
        const contributions = should.find((c) => c.nested?.path === 'speaker_contributions');
        expect(contributions?.nested?.inner_hits).toEqual({
            _source: ['speaker_contributions.contribution_id'],
        });
    });

    // Transcripts are long, so a bare OR match there let off-topic queries match
    // on a single common word and kept them out of the zero-results case.
    it('requires the same share of terms in the transcript clauses as in the title', () => {
        const should = lexicalShouldClauses('τι αποφάσισε το συμβούλιο');

        const contributions = should.find((c) => c.nested?.path === 'speaker_contributions');
        expect(minimumShouldMatchOf(contributions?.nested?.query)).toBe('2<75%');
    });

    // Field tier name > description > transcript: transcripts are the noisiest
    // field, so a transcript-only match must not outweigh name/description hits.
    it('keeps the transcript boost below the name and description boosts', () => {
        const should = lexicalShouldClauses('προϋπολογισμός');

        const contributions = should.find((c) => c.nested?.path === 'speaker_contributions');
        const transcriptMatch = Object.values(contributions?.nested?.query?.match ?? {})[0];
        expect(typeof transcriptMatch === 'object' && transcriptMatch.boost).toBe(1);
    });
});

describe('buildSearchQuery semantic retriever', () => {
    function retrievers(config: SearchRequest['config']) {
        const q = buildSearchQuery({ query: 'lava cake', config }, NO_EXTRACTED_FILTERS);
        const rrf = q.retriever?.rrf as estypes.RetrieverContainer['rrf'];
        return rrf?.retrievers ?? [];
    }

    function semanticStandard(config: SearchRequest['config']) {
        return retrievers(config)[1]?.standard;
    }

    // The ranking function only ever scales a score up (see applyRanking), so the
    // cutoff is nested inside a min_score-only function_score, applied to the raw
    // semantic score before the ranking function_score wraps around it — see the
    // comment on buildSemanticRetriever. Unwrap both layers to reach it.
    function semanticCutoffQuery(config: SearchRequest['config']) {
        const { inner: cutoffLayer } = unwrapRanking(semanticStandard(config)?.query);
        return cutoffLayer?.function_score as estypes.QueryDslFunctionScoreQuery;
    }

    it('omits the semantic retriever when semantic search is disabled', () => {
        expect(retrievers({ enableSemanticSearch: false })).toHaveLength(1);
    });

    it('cuts off the semantic retriever on the raw score so unrelated queries can return zero hits', () => {
        expect(retrievers({ enableSemanticSearch: true })).toHaveLength(2);

        const cutoff = semanticCutoffQuery({ enableSemanticSearch: true });
        // A raw cutoff, not a normalized one: minmax maps the best hit of every
        // query to 1.0, so a fractional cutoff could never empty the results.
        // 3.23 sits between the measured off-topic band (<= 3.226) and the
        // paraphrase band (>= 3.230) — see DEFAULT_SEMANTIC_MIN_SCORE.
        expect(cutoff.min_score).toBe(3.23);

        const bool = cutoff.query?.bool as BoolQuery;
        const should = (bool.should ?? []) as estypes.QueryDslQueryContainer[];
        expect(should.map((c) => c.semantic?.field)).toEqual([
            'name.semantic',
            'description.semantic',
        ]);

        // The filters still scope the semantic arm, but no lexical clause gates it:
        // a pure paraphrase above the cutoff must still be able to match.
        const filters = (bool.filter ?? []) as estypes.QueryDslQueryContainer[];
        expect(filters.some((f) => f.term?.['meeting_released'] !== undefined)).toBe(true);
        expect(
            filters.some(
                (f) =>
                    Array.isArray(f.bool?.should) &&
                    (f.bool!.should as estypes.QueryDslQueryContainer[]).some((c) => c.multi_match)
            )
        ).toBe(false);
    });

    // The cutoff is calibrated against the sum of these boosts, so a change to
    // either without recalibrating would silently move the threshold.
    it('keeps the semantic boosts the cutoff was calibrated against', () => {
        const bool = semanticCutoffQuery({ enableSemanticSearch: true }).query?.bool as BoolQuery;
        const should = (bool.should ?? []) as estypes.QueryDslQueryContainer[];

        expect(should.map((c) => c.semantic?.boost)).toEqual([2.0, 1.5]);
    });

    it('allows overriding semanticMinScore via config', () => {
        const cutoff = semanticCutoffQuery({ enableSemanticSearch: true, semanticMinScore: 3.1 });

        expect(cutoff.min_score).toBe(3.1);
    });

    it('applies the ranking function to the semantic retriever too, after the cutoff', () => {
        const { functionScore } = unwrapRanking(semanticStandard({ enableSemanticSearch: true })?.query);

        expect(functionScore.boost_mode).toBe('multiply');
        expect(functionScore.functions).toHaveLength(1);
    });
});

describe('buildSearchQuery ranking function', () => {
    // Pulls the script_score params off whichever query the ranking function_score
    // wraps, regardless of which branch (filter-only, lexical, semantic) built it.
    function rankingScriptParams(query: estypes.QueryDslQueryContainer | undefined) {
        const functionScore = query?.function_score as estypes.QueryDslFunctionScoreQuery;
        const fn = functionScore?.functions?.[0] as estypes.QueryDslFunctionScoreContainer;
        const script = fn?.script_score?.script as estypes.Script;
        return script.params as Record<string, number>;
    }

    it('scores administrative bodies council > committee > community, and weighs discussion length and recency', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);
        const rrf = q.retriever?.rrf as estypes.RetrieverContainer['rrf'];
        const standard = rrf?.retrievers?.[0]?.standard as estypes.RetrieverContainer['standard'];
        const params = rankingScriptParams(standard?.query);

        expect(params.councilWeight).toBeGreaterThan(params.committeeWeight);
        expect(params.committeeWeight).toBeGreaterThan(params.communityWeight);
        // A meeting with no administrative body assigned ranks like the lowest tier,
        // not like the best one, and never below the floor of 1.0 (no penalty).
        expect(params.defaultAdminBodyWeight).toBe(params.communityWeight);
        expect(params.discussionWeight).toBeGreaterThan(0);
        expect(params.recencyWeight).toBeGreaterThan(0);
    });

    it('uses the same ranking function in the filter-only branch, replacing the (zero) filter score', () => {
        const q = buildSearchQuery({ personIds: ['p1'] }, NO_EXTRACTED_FILTERS);
        const functionScore = q.query?.function_score as estypes.QueryDslFunctionScoreQuery;

        expect(functionScore.boost_mode).toBe('replace');
        expect(q.sort).toBeUndefined();

        const filter = (functionScore.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
        expect(findPersonFilter(filter)).toBeDefined();
    });

    // Regression: nowMillis used to be read via a fresh Date.now() inside
    // buildRankingFunction, called separately per retriever, so the lexical and
    // semantic retrievers could score recency against two different instants.
    it('scores every ranking function built for one request against the same instant', () => {
        const q = buildSearchQuery(
            { query: 'πάρκα', config: { enableSemanticSearch: true } },
            NO_EXTRACTED_FILTERS
        );
        const rrf = q.retriever?.rrf as estypes.RetrieverContainer['rrf'];
        const lexicalStandard = rrf?.retrievers?.[0]?.standard as estypes.RetrieverContainer['standard'];
        const semanticStandard = rrf?.retrievers?.[1]?.standard as estypes.RetrieverContainer['standard'];

        const lexicalParams = rankingScriptParams(lexicalStandard?.query);
        const semanticParams = rankingScriptParams(semanticStandard?.query);

        expect(typeof lexicalParams.nowMillis).toBe('number');
        expect(semanticParams.nowMillis).toBe(lexicalParams.nowMillis);
    });
});

describe('buildSearchQuery filter-only mode', () => {
    it('builds a ranked rrf query when query text is present', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);

        expect(q.retriever).toBeDefined();
        expect(q.sort).toBeUndefined();
    });

    it.each([undefined, '', '   '])(
        'builds a filter-only query ranked by the ranking function when query is %p',
        (query) => {
            const q = buildSearchQuery(
                {
                    query,
                    personIds: ['p1'],
                    dateRange: { start: '2026-07-01', end: '2026-07-31' },
                },
                NO_EXTRACTED_FILTERS
            );

            // No ranking retrievers (they require query text)...
            expect(q.retriever).toBeUndefined();
            // ...instead a filtered query whose function_score (boost_mode: 'replace',
            // see the dedicated ranking-function describe block) ranks it, so there's
            // no separate explicit sort.
            expect(q.sort).toBeUndefined();

            const functionScore = q.query!.function_score as estypes.QueryDslFunctionScoreQuery;
            const filter = (functionScore.query?.bool?.filter ??
                []) as estypes.QueryDslQueryContainer[];
            expect(filter.some((f) => f.term?.['meeting_released'] !== undefined)).toBe(true);
            expect(findPersonFilter(filter)).toBeDefined();
            expect(filter.some((f) => f.range?.['meeting_date'] !== undefined)).toBe(true);
        }
    );

    it('respects pagination config in the filter-only branch', () => {
        const q = buildSearchQuery({ config: { size: 5, from: 10 } }, NO_EXTRACTED_FILTERS);

        expect(q.size).toBe(5);
        expect(q.from).toBe(10);
    });
});
