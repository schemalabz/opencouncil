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

// Every lexical clause is wrapped in a flattenToTier function_score (see
// FIELD_TIER in query.ts). Unwrap one to its inner query and tier params.
function unflatten(clause: estypes.QueryDslQueryContainer | undefined): {
    inner: estypes.QueryDslQueryContainer | undefined;
    base: number | undefined;
    k: number | undefined;
} {
    const fs = clause?.function_score as estypes.QueryDslFunctionScoreQuery | undefined;
    const fn = fs?.functions?.[0] as estypes.QueryDslFunctionScoreContainer | undefined;
    const script = fn?.script_score?.script as estypes.Script | undefined;
    const params = (script?.params ?? {}) as Record<string, number>;
    return { inner: fs?.query as estypes.QueryDslQueryContainer | undefined, base: params.base, k: params.k };
}

// Tier-wrapped clause whose inner query matches `field` (via match, match_phrase
// or fuzziness presence), returned unflattened.
function tierClauseOn(
    should: estypes.QueryDslQueryContainer[],
    predicate: (inner: estypes.QueryDslQueryContainer) => boolean
): { inner: estypes.QueryDslQueryContainer | undefined; base: number | undefined; k: number | undefined } | undefined {
    for (const c of should) {
        const u = unflatten(c);
        if (u.inner && predicate(u.inner)) return u;
    }
    return undefined;
}

// Two should-clauses nest on speaker_contributions (the transcript text and
// the speaker name), so select by the field each one matches rather than by the
// shared path — otherwise a reordering would silently point a test at the wrong
// clause and still pass. Clauses arrive tier-wrapped; this returns the inner
// nested query with its tier.
function nestedClauseOn(
    should: estypes.QueryDslQueryContainer[],
    field: string
): { inner: estypes.QueryDslQueryContainer | undefined; base: number | undefined; k: number | undefined } | undefined {
    return tierClauseOn(
        should,
        (inner) =>
            inner.nested?.path === 'speaker_contributions' &&
            inner.nested.query?.match?.[field] !== undefined
    );
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

// The scored query is a single bool (no rank fusion) — see the RRF regression
// note on the semantic describe block. Unwraps the ranking function_score and
// splits the text clause under `must` into its arms: with semantic search on,
// the lexical bool is the first branch of a dis_max against the semantic
// fallback; with it off, it stands alone and there is no dis_max.
function textArms(query: string, config?: SearchRequest['config']) {
    const q = buildSearchQuery({ query, config }, NO_EXTRACTED_FILTERS);
    const { inner } = unwrapRanking(q.query);
    const outer = inner?.bool as BoolQuery;
    const textClause = ((outer.must ?? []) as estypes.QueryDslQueryContainer[])[0];
    const disMax = textClause?.dis_max;
    const queries = (disMax?.queries ?? []) as estypes.QueryDslQueryContainer[];
    return {
        disMax,
        lexical: (disMax ? queries[0] : textClause)?.bool as BoolQuery | undefined,
        semantic: queries[1]?.function_score as estypes.QueryDslFunctionScoreQuery | undefined,
    };
}

// Lexical should-clauses, unwrapped from whichever shape (dis_max or bare
// bool) the request produced.
function scoredShouldClauses(
    query: string,
    config?: SearchRequest['config']
): estypes.QueryDslQueryContainer[] {
    return (textArms(query, config).lexical?.should ?? []) as estypes.QueryDslQueryContainer[];
}

describe('buildSearchQuery lexical ranking', () => {
    const lexicalShouldClauses = scoredShouldClauses;

    it('nudges the text-relevance score with the ranking function, multiplicatively', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);
        const { functionScore } = unwrapRanking(q.query);

        expect(functionScore.boost_mode).toBe('multiply');
        expect(functionScore.functions).toHaveLength(1);
    });

    // Each field carries its own tier-wrapped clause (a shared best_fields
    // multi_match could not carry two tier bases). introduced_by_person_name
    // serves person-name queries (a recurring pattern in logged user searches)
    // via the subjects the person introduced; speaker_person_name is nested and
    // belongs a tier lower (see the speaker-name clause tests).
    it('applies exact per-field term and phrase clauses in their tiers', () => {
        const should = lexicalShouldClauses('πάρκα Κυψέλης');

        const exactMatchOn = (field: string) =>
            tierClauseOn(should, (inner) => {
                const m = inner.match?.[field];
                return typeof m === 'object' && m !== null && !('fuzziness' in m);
            });

        const nameTerm = exactMatchOn('name');
        expect(nameTerm?.inner?.match?.['name']).toEqual({
            query: 'πάρκα Κυψέλης',
            minimum_should_match: '2<75%',
        });

        const descriptionTerm = exactMatchOn('description');
        expect(descriptionTerm?.inner?.match?.['description']).toEqual({
            query: 'πάρκα Κυψέλης',
            minimum_should_match: '2<75%',
        });

        const introducer = exactMatchOn('introduced_by_person_name');
        expect(introducer?.inner?.match?.['introduced_by_person_name']).toEqual({
            query: 'πάρκα Κυψέλης',
            minimum_should_match: '2<75%',
        });

        const namePhrase = tierClauseOn(should, (inner) => inner.match_phrase?.['name'] !== undefined);
        expect(namePhrase?.inner?.match_phrase?.['name']).toEqual({ query: 'πάρκα Κυψέλης' });

        const descriptionPhrase = tierClauseOn(should, (inner) => inner.match_phrase?.['description'] !== undefined);
        expect(descriptionPhrase?.inner?.match_phrase?.['description']).toEqual({ query: 'πάρκα Κυψέλης' });

        // The tier ladder (see FIELD_TIER): name above introducer above
        // description; phrases are additive bonuses within their field.
        expect(nameTerm!.base!).toBeGreaterThan(introducer!.base!);
        expect(introducer!.base!).toBeGreaterThan(descriptionTerm!.base!);
        expect(namePhrase!.base!).toBeGreaterThan(descriptionPhrase!.base!);
    });

    // Raw BM25 must not rank within a tier (title length normalization and
    // description term repetition buried a recent 139-minute subject under an
    // old 4-minute one for "δάνειο"): every clause is rescored to
    // base + k * log1p(bm25), leaving BM25 as a small within-tier tiebreak.
    it('flattens every lexical clause to its tier band', () => {
        const should = lexicalShouldClauses('πάρκα');
        for (const clause of should) {
            const fs = clause.function_score as estypes.QueryDslFunctionScoreQuery;
            expect(fs).toBeDefined();
            expect(fs.boost_mode).toBe('replace');
            const script = (fs.functions?.[0] as estypes.QueryDslFunctionScoreContainer)
                ?.script_score?.script as estypes.Script;
            expect(script.source).toBe('params.base + params.k * Math.log1p(_score)');
        }
    });

    it('restricts typo tolerance to a low-tier fuzzy match on the name field', () => {
        const should = lexicalShouldClauses('ανακίκλωση');

        const fuzzy = tierClauseOn(should, (inner) => {
            const m = inner.match?.['name'];
            return typeof m === 'object' && m !== null && 'fuzziness' in m;
        });
        expect(fuzzy?.inner?.match?.['name']).toEqual({
            query: 'ανακίκλωση',
            // AUTO:4,10 = 1 edit for 4-9 char terms; the default AUTO's 2 edits
            // from 6 chars up conflates unrelated Greek stems (συνταγ -> συντηρ).
            fuzziness: 'AUTO:4,10',
            prefix_length: 2,
            minimum_should_match: '2<75%',
        });

        // Regression: fuzziness on description let off-topic queries match long
        // descriptions through one-edit-away terms ("lava" matched a French
        // description via "lave").
        expect(tierClauseOn(should, (inner) => {
            const m = inner.match?.['description'];
            return typeof m === 'object' && m !== null && 'fuzziness' in m;
        })).toBeUndefined();
    });

    it('keeps inner_hits on the transcript clause', () => {
        const should = lexicalShouldClauses('πάρκα');
        const transcript = nestedClauseOn(should, 'speaker_contributions.text');
        expect(transcript?.inner?.nested?.inner_hits).toEqual({
            _source: ['speaker_contributions.contribution_id'],
        });
    });

    // Transcripts are long, so a bare OR match there let off-topic queries match
    // on a single common word and kept them out of the zero-results case.
    it('requires the same share of terms in the transcript clauses as in the title', () => {
        const should = lexicalShouldClauses('τι αποφάσισε το συμβούλιο');

        const transcript = nestedClauseOn(should, 'speaker_contributions.text');
        expect(minimumShouldMatchOf(transcript?.inner?.nested?.query)).toBe('2<75%');
    });

    // Field tier name > description > transcript: transcripts are the noisiest
    // field, so a transcript-only match must not outweigh name/description hits.
    it('keeps the transcript tier below the name and description tiers', () => {
        const should = lexicalShouldClauses('προϋπολογισμός');

        const transcript = nestedClauseOn(should, 'speaker_contributions.text');
        const nameTerm = tierClauseOn(should, (inner) => {
            const m = inner.match?.['name'];
            return typeof m === 'object' && m !== null && !('fuzziness' in m);
        });
        const descriptionTerm = tierClauseOn(
            should,
            (inner) => typeof inner.match?.['description'] === 'object'
        );
        expect(descriptionTerm!.base!).toBeGreaterThan(transcript!.base!);
        expect(nameTerm!.base!).toBeGreaterThan(descriptionTerm!.base!);
    });
});

describe('buildSearchQuery speaker-name clause', () => {
    const speakerNameClause = (query: string) =>
        nestedClauseOn(scoredShouldClauses(query), 'speaker_contributions.speaker_person_name');

    it('matches the speakers of a subject, in the weakest tier of the query', () => {
        const clause = speakerNameClause('Χάρης Δούκας');

        expect(clause?.inner?.nested?.query?.match?.['speaker_contributions.speaker_person_name'])
            .toEqual({
                query: 'Χάρης Δούκας',
                minimum_should_match: '2<75%',
            });

        // Weakest tier in the query, under the transcript's: a person-name
        // query leads with the subjects the person introduced, and the ones
        // they only spoke in follow. Calibrated on the production index — see
        // the FIELD_TIER.speakerName note for the measured top-10 displacement.
        const transcript = nestedClauseOn(
            scoredShouldClauses('Χάρης Δούκας'),
            'speaker_contributions.text'
        );
        expect(clause!.base!).toBeLessThan(transcript!.base!);
    });

    // A mayor speaks in nearly every subject, so an OR match on a two-term name
    // would return the whole index for the first name alone.
    it('requires the same share of terms as the title clauses', () => {
        const clause = speakerNameClause('Χάρης Δούκας');
        expect(minimumShouldMatchOf(clause?.inner?.nested?.query)).toBe('2<75%');
    });

    // inner_hits marks which contributions matched the query text. A speaker-name
    // match would add contributions whose text never mentions the query.
    it('carries no inner_hits, unlike the transcript clause', () => {
        const clause = speakerNameClause('Χάρης Δούκας');
        expect(clause?.inner?.nested?.inner_hits).toBeUndefined();
    });
});

describe('buildSearchQuery semantic fallback (dis_max)', () => {
    function semanticClause(config: SearchRequest['config']) {
        return textArms('lava cake', config).semantic;
    }

    it('omits the semantic clause when semantic search is disabled', () => {
        const a = textArms('lava cake', { enableSemanticSearch: false });
        expect(a.disMax).toBeUndefined();
        expect(a.semantic).toBeUndefined();
        expect(a.lexical?.should).toBeDefined();
    });

    // Regression (the "δάνειο" ordering bug): the semantic signal used to be a
    // second RRF retriever. Rank fusion double-counted whichever document
    // happened to clear the semantic cutoff, so a 4-minute discussion outranked
    // a 139-minute one whose raw semantic score fell just below the cutoff.
    // The semantic side now competes with the summed lexical clauses in a
    // dis_max (score = max): it can never add to — and so never reorder —
    // documents with a stronger lexical score. tie_breaker stays 0 because
    // strong lexical matches sit ~2% apart, so even a small added share of
    // the semantic score would reorder them.
    it('competes semantic against lexical via a pure-max dis_max, not a second retriever', () => {
        const q = buildSearchQuery(
            { query: 'δάνειο', config: { enableSemanticSearch: true } },
            NO_EXTRACTED_FILTERS
        );
        expect(q.retriever).toBeUndefined();

        const a = textArms('δάνειο', { enableSemanticSearch: true });
        expect(a.disMax?.tie_breaker).toBe(0);
        expect(a.semantic).toBeDefined();
        expect(a.lexical?.should).toBeDefined();
    });

    it('maps the semantic score into description-tier BM25 space and drops sub-cutoff hits', () => {
        const clause = semanticClause({ enableSemanticSearch: true })!;

        const fn = clause.functions?.[0] as estypes.QueryDslFunctionScoreContainer;
        const script = fn?.script_score?.script as estypes.Script;
        // Math.max floor: script_score must not return a negative score, and
        // far-below-cutoff hits would map deeply negative at this scale.
        expect(script.source).toContain('params.base + (_score - params.cutoff) * params.scale');
        expect(script.source).toContain('Math.max');
        const params = script.params as Record<string, number>;
        // A raw similarity, not a normalized one: minmax maps the best hit of
        // every query to 1.0, so a cutoff on it could never empty the results.
        // 0.930 sits just under the measured paraphrase floor (0.9314) and above
        // the off-topic band (<= 0.9300, one outlier aside) —
        // see DEFAULT_SEMANTIC_MIN_SCORE.
        expect(params.cutoff).toBe(0.930);
        // base sits inside the flattened description band (~24-30, where weak
        // stem-coincidence matches like bar licenses matching "ζώα χωρίς
        // ιδιοκτήτη" via ζω/ιδιοκτητ land) and the mapped ceiling (~34) stays
        // below the flattened name band (~58+) — see SEMANTIC_MAPPED_BASE.
        expect(params.base).toBe(26);
        expect(params.scale).toBe(320);
        expect(clause.boost_mode).toBe('replace');
        // min_score sees the mapped score: raw below the cutoff maps below
        // base and is dropped, keeping zero results for off-topic queries.
        expect(clause.min_score).toBe(params.base);
    });

    // The gate must stay a per-field similarity. Summing the two fields (the
    // earlier shape) turned the cutoff into an agreement test that no title
    // match could pass on its own; boosting either field would rescale the gate
    // so the cutoff stopped being a similarity at all. Both regressions are
    // invisible in the query shape unless asserted here.
    it('gates on the best single field, unboosted, never on the sum', () => {
        const clause = semanticClause({ enableSemanticSearch: true })!;
        const disMax = clause.query?.dis_max as estypes.QueryDslDisMaxQuery;

        expect(clause.query?.bool).toBeUndefined();
        expect(disMax).toBeDefined();
        expect(disMax.tie_breaker).toBe(0);
        expect(disMax.queries.map((c) => c.semantic?.field)).toEqual([
            'name.semantic',
            'description.semantic',
        ]);
        expect(disMax.queries.map((c) => c.semantic?.boost)).toEqual([undefined, undefined]);
    });

    // Regression for the measured case: "ηλεκτρικά πατίνια" had the highest
    // title similarity of any on-topic query measured (0.9546) and still
    // returned zero semantic hits under the summed gate, because its
    // descriptions disagreed. A title-strength similarity must clear the cutoff
    // on its own.
    it('admits a title-only match at title-strength similarity', () => {
        const clause = semanticClause({ enableSemanticSearch: true })!;
        const fn = clause.functions?.[0] as estypes.QueryDslFunctionScoreContainer;
        const params = (fn?.script_score?.script as estypes.Script).params as Record<string, number>;

        const titleOnlySimilarity = 0.9546;
        const mapped = params.base + (titleOnlySimilarity - params.cutoff) * params.scale;
        expect(mapped).toBeGreaterThan(clause.min_score as number);
    });

    it('allows overriding semanticMinScore via config', () => {
        const clause = semanticClause({ enableSemanticSearch: true, semanticMinScore: 0.94 })!;
        const fn = clause.functions?.[0] as estypes.QueryDslFunctionScoreContainer;
        const script = fn?.script_score?.script as estypes.Script;

        expect((script.params as Record<string, number>).cutoff).toBe(0.94);
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
        const params = rankingScriptParams(q.query);

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

    it('scores recency against a concrete instant', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);
        const params = rankingScriptParams(q.query);

        expect(typeof params.nowMillis).toBe('number');
    });
});

describe('buildSearchQuery location handling', () => {
    // radiusMeters is METRES: 2000 is the 2km that resolveLocationCoordinates
    // actually produces. The earlier fixture used `radius: 40` and asserted
    // "40km", which agreed with the consumer's `km` suffix but not with any
    // value the app ever passes, so it hid the unit bug.
    const LOCATIONS = [{ point: { lat: 38.0, lon: 23.7 }, radiusMeters: 2000 }];

    function lexicalQueryOf(q: ReturnType<typeof buildSearchQuery>) {
        return unwrapRanking(q.query).inner;
    }

    // Regression: locations used to be a hard geo_distance filter. Only ~45% of
    // subjects carry a location pin, so any AI-extracted location silently
    // dropped every pin-less subject — "παλαιστίνη" returned zero results even
    // though subjects carry it in the title.
    it('keeps AI-extracted locations out of the hard filters', () => {
        const q = buildSearchQuery(
            { query: 'παλαιστίνη', locations: LOCATIONS },
            NO_EXTRACTED_FILTERS
        );
        const lexical = lexicalQueryOf(q);

        const filters = (lexical?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
        expect(JSON.stringify(filters)).not.toContain('geo_distance');
    });

    it('applies locations as a proximity boost that cannot match on its own', () => {
        const q = buildSearchQuery(
            { query: 'παλαιστίνη', locations: LOCATIONS },
            NO_EXTRACTED_FILTERS
        );
        const lexical = lexicalQueryOf(q);

        // Text clauses sit inside `must`; geo boosts are `should`-only, so a
        // subject near the location but matching no text cannot surface.
        const must = (lexical?.bool?.must ?? []) as estypes.QueryDslQueryContainer[];
        const should = (lexical?.bool?.should ?? []) as estypes.QueryDslQueryContainer[];
        expect(must).toHaveLength(1);
        expect(should).toHaveLength(1);
        expect(should[0]?.geo_distance).toMatchObject({ distance: '2000m' });
        expect(lexical?.bool?.minimum_should_match).toBeUndefined();
    });

    // Regression: the clause emitted `${radiusMeters}km`, so the metre value
    // was read as kilometres — a 1000x overshoot. It never threw: at the
    // then-current 40000m the clause asked for 40000km, past the ~20015km
    // furthest two points on Earth can be apart, so every pinned subject
    // matched and the boost stopped expressing proximity at all. It became a
    // flat bonus for carrying a pin. Assert the unit, not just the number.
    it('emits the radius in metres, not kilometres', () => {
        const q = buildSearchQuery(
            { query: 'παλαιστίνη', locations: LOCATIONS },
            NO_EXTRACTED_FILTERS
        );
        const should = (lexicalQueryOf(q)?.bool?.should ?? []) as estypes.QueryDslQueryContainer[];
        const distance = should[0]?.geo_distance?.distance as string;

        expect(distance).toMatch(/^\d+m$/);
        expect(parseInt(distance, 10)).toBe(LOCATIONS[0].radiusMeters);
    });

    it('adds no geo clause when no locations are extracted', () => {
        const q = buildSearchQuery({ query: 'παλαιστίνη' }, NO_EXTRACTED_FILTERS);
        const lexical = lexicalQueryOf(q);

        expect(lexical?.bool?.must).toBeDefined();
        expect(JSON.stringify(lexical)).not.toContain('geo_distance');
    });

    it('keeps locations as a hard filter in the filter-only browse path', () => {
        const q = buildSearchQuery({ locations: LOCATIONS }, NO_EXTRACTED_FILTERS);
        const functionScore = q.query?.function_score as estypes.QueryDslFunctionScoreQuery;
        const filter = (functionScore.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];

        expect(JSON.stringify(filter)).toContain('geo_distance');
    });
});

describe('buildSearchQuery punctuation variants', () => {
    const lexicalShouldClauses = scoredShouldClauses;

    // Mobile keyboards auto-substitute U+2019; official minutes use the Greek
    // tonos (U+0384) as an apostrophe (ΔΙ΄ΕΥΧΩΝ). All variants must behave
    // like the ASCII apostrophe.
    it.each(['δι’ευχών', 'δι΄ευχών', "δι'ευχών"])(
        'normalizes %s to the ASCII apostrophe in every clause',
        (variant) => {
            const clauses = lexicalShouldClauses(variant);
            const serialized = JSON.stringify(clauses);
            expect(serialized).toContain("δι'ευχών");
            expect(serialized).not.toContain('’');
            expect(serialized).not.toContain('΄');
        }
    );

    // Variant clauses are per-field and tier-wrapped like the main clauses:
    // whichever shape the index holds, the score tier is the same. These
    // helpers collect the exact term-clause query strings per field, main
    // clause included.
    function exactTermQueries(clauses: estypes.QueryDslQueryContainer[], field: string): string[] {
        const queries: string[] = [];
        for (const c of clauses) {
            const m = unflatten(c).inner?.match?.[field];
            if (typeof m === 'object' && m !== null && !('fuzziness' in m) && typeof m.query === 'string') {
                queries.push(m.query);
            }
        }
        return queries;
    }

    it('adds a space-split variant clause for intra-word apostrophes', () => {
        const clauses = lexicalShouldClauses("δι'ευχών");

        // Intact-token form plus the split-token form the tonos spelling
        // produces in the index (ΔΙ΄ΕΥΧΩΝ → δι, ευχ) — on both tiered fields.
        expect(exactTermQueries(clauses, 'name')).toEqual(['δι ευχών', "δι'ευχών"]);
        expect(exactTermQueries(clauses, 'description')).toEqual(['δι ευχών', "δι'ευχών"]);
    });

    // Long acronyms are indexed plain (ΔΕΥΑΧ, ΝΠΔΔ, ΟΤΑ — zero dotted names on
    // the production index), but users type them dotted. The glued variant
    // reaches the plain spelling; the intact clause still reaches dotted names
    // like Δ.Ε.Ρ.Τ.Ο. where the index kept the dots.
    it('adds a glued variant clause for dotted acronyms', () => {
        const clauses = lexicalShouldClauses('τιμολόγια Δ.Ε.Υ.Α.Χ.');

        expect(exactTermQueries(clauses, 'name')).toEqual(['τιμολόγια ΔΕΥΑΧ.', 'τιμολόγια Δ.Ε.Υ.Α.Χ.']);
    });

    it('adds independent variants when a query mixes apostrophes and dotted acronyms', () => {
        const clauses = lexicalShouldClauses("δι'ευχών Δ.Ε.");

        // One variant per punctuation class plus the intact query — each
        // variant targets its own index spelling, they do not compound.
        expect(exactTermQueries(clauses, 'name')).toEqual(["δι ευχών Δ.Ε.", "δι'ευχών ΔΕ.", "δι'ευχών Δ.Ε."]);
    });

    it('adds no variant clause for punctuation-free queries', () => {
        const clauses = lexicalShouldClauses('πάρκα');
        expect(exactTermQueries(clauses, 'name')).toEqual(['πάρκα']);
    });
});

describe('buildSearchQuery filter-only mode', () => {
    it('builds a single scored query (no retriever) when query text is present', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);

        expect(q.retriever).toBeUndefined();
        expect(q.query).toBeDefined();
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

            // No text clauses (they require query text)...
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
