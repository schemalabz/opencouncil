import type { estypes } from '@elastic/elasticsearch';
import type { SearchRequest } from '../types';

// Avoid pulling the full env validation (createEnv) at import time; buildFilters
// itself does not read env, only the module-level import does.
jest.mock('@/env.mjs', () => ({ env: { ELASTICSEARCH_INDEX: 'test-index' } }));

import { buildFilters, buildSearchQuery, MAX_RANKING_MULTIPLIER_RATIO } from '../query';
import { ADMIN_BODY_TIER } from '@/lib/ranking/subjects';
import schema from '../../../../elasticsearch/schema.json';
import type { ExtractedFilters } from '../types';

const NO_EXTRACTED_FILTERS: ExtractedFilters = {
    cityIds: null,
    dateRange: null,
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

// Total tier base each field contributes to a document that matches it. A field
// emits more than one clause (the strict/partial coverage pair), and they share
// one bool.should, so a document collects the SUM of both — see FIELD_TIER.
function tierBaseByField(should: estypes.QueryDslQueryContainer[]): Record<string, number> {
    const totals: Record<string, number> = {};
    const add = (label: string, base: number | undefined) => {
        totals[label] = (totals[label] ?? 0) + (base ?? 0);
    };

    for (const clause of should) {
        const { inner, base } = unflatten(clause);
        if (!inner) continue;
        if (inner.nested) {
            const field = Object.keys(inner.nested.query?.match ?? {})[0] ?? '';
            add(field.endsWith('speaker_person_name') ? 'speakerName' : 'transcript', base);
            continue;
        }
        if (inner.match_phrase) {
            add(Object.keys(inner.match_phrase)[0] === 'name' ? 'namePhrase' : 'descriptionPhrase', base);
            continue;
        }
        const field = Object.keys(inner.match ?? {})[0];
        if (!field) continue;
        const m = inner.match![field];
        const fuzzy = typeof m === 'object' && m !== null && 'fuzziness' in m;
        if (field === 'name') add(fuzzy ? 'fuzzyName' : 'nameTerm', base);
        else if (field === 'description') add('descriptionTerm', base);
        else if (field === 'introduced_by_person_name') add('introducer', base);
        else if (field === 'location_text') add('locationText', base);
    }
    return totals;
}

// Every query string a clause can match on, gathered through the shapes the
// builders emit: a dis_max over spellings, a nested wrapper, a bool.should, and
// the match / match_phrase / combined_fields leaves. Used to assert that a
// clause reaches every spelling of the query, whichever family it belongs to.
function queryTextsOf(clause: estypes.QueryDslQueryContainer | undefined): string[] {
    if (!clause) return [];
    if (clause.dis_max) {
        return (clause.dis_max.queries as estypes.QueryDslQueryContainer[]).flatMap(queryTextsOf);
    }
    if (clause.nested) return queryTextsOf(clause.nested.query);
    if (clause.bool?.should) {
        return (clause.bool.should as estypes.QueryDslQueryContainer[]).flatMap(queryTextsOf);
    }
    if (clause.combined_fields) return [clause.combined_fields.query];
    const leaf = clause.match ?? clause.match_phrase;
    if (!leaf) return [];
    return Object.values(leaf).map((options) =>
        typeof options === 'object' && options !== null ? String(options.query) : String(options)
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

// One field's term clauses, as [strict, partial] — the coverage pair emits them
// in that order (see PARTIAL_COVERAGE_SHARE).
function termPair(query: string, field: string) {
    return scoredShouldClauses(query)
        .map(unflatten)
        .filter(({ inner }) => {
            const m = inner?.match?.[field];
            return typeof m === 'object' && m !== null && !('fuzziness' in m);
        });
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

    // The clauses share one bool.should, so a document scores the SUM of every
    // tier it matched — a stack of low tiers can outscore a single high one.
    // FIELD_TIER states that arithmetic and the conclusion that follows from it
    // (name dominance is a property of the corpus, not of these constants), so
    // pin both here: the live-index check that measures the corpus side needs an
    // index, and changing a base moves these numbers silently otherwise.
    it('lets a stack of low tiers outscore a title match on the bases alone', () => {
        const bases = tierBaseByField(lexicalShouldClauses('πάρκα Κυψέλης'));
        const [, partialName] = termPair('πάρκα Κυψέλης', 'name');

        // What a title match collects from its TITLE alone — its worst case, and
        // the only case the corpus correlation below cannot help it in. The
        // strict/partial pair of nameTerm sums back to its whole tier, so
        // bases.nameTerm is the tier total, not a share.
        const titleStack = bases.nameTerm + bases.namePhrase + bases.fuzzyName;
        // The strongest stack a document reaches WITHOUT covering the query in
        // its title. It is not name-free: the partial half of the name clause
        // takes a single matching term (see PARTIAL_COVERAGE_SHARE), so one
        // title word plus the stack also collects the name tier's partial share.
        const nonTitleStack = partialName.base! + bases.introducer + bases.descriptionTerm
            + bases.descriptionPhrase + bases.transcript + bases.speakerName;

        expect(titleStack).toBeCloseTo(64, 5);
        expect(nonTitleStack).toBeCloseTo(71.3, 5);
        // The stack already leads on the constants alone — no metadata is needed
        // to invert the pair. Whether title matches actually lead is a property
        // of the corpus, measured by scripts/search-eval.ts --tier-margin. If
        // this ever flips, the tiers have started to hold on their own and
        // FIELD_TIER's note needs rewriting.
        expect(nonTitleStack).toBeGreaterThan(titleStack);
    });

    // The multiplier is a tiebreak among comparable matches, so there is one gap
    // it must never close: a document that covers the whole query in a field
    // outranks one that covers a single term of it, whatever its administrative
    // body, discussion length or date says. That bound moves with the weights,
    // which is the point — the earlier assertion here divided by the multiplier
    // ceiling, so widening the multiplier made it EASIER to pass.
    it('keeps the ranking multiplier under the coverage gap it must not close', () => {
        const [strict, partial] = termPair('πάρκα Κυψέλης', 'name');

        const fullOverPartial = (strict.base! + partial.base!) / partial.base!;
        expect(MAX_RANKING_MULTIPLIER_RATIO).toBeLessThan(fullOverPartial);
    });

    // scaleTier scales the base AND the k of a tier band, so the log tiebreak
    // keeps the same proportion to its band at every share. Scaling the base
    // alone would leave the partial half of every pair with its whole tier's k,
    // doubling the within-tier log spread the flattening exists to contain.
    it('scales the log tiebreak with the share of the tier it belongs to', () => {
        const [strict, partial] = termPair('πάρκα Κυψέλης', 'name');

        expect(strict.k! / partial.k!).toBeCloseTo(strict.base! / partial.base!, 5);
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

    // Nothing between the query and the search results reads inner_hits
    // (partitionHits works off `_source.id`), so asking for them made
    // Elasticsearch run a sub-search per hit for a payload no code opened.
    it('asks for no inner_hits on any nested clause', () => {
        const should = lexicalShouldClauses('πάρκα');

        const nested = should
            .map(unflatten)
            .filter(({ inner }) => inner?.nested !== undefined);
        expect(nested.length).toBeGreaterThan(0);
        for (const { inner } of nested) {
            expect(inner!.nested!.inner_hits).toBeUndefined();
        }
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
    // The clause scores the EXTRACTED location name, so it fires on every subject
    // in the place: it says where a subject is, never what it is about. At the
    // description tier every Argos subject gained the same 15 for "σχολεία
    // Άργους", which put tree cutting and a theatre booking above school
    // maintenance. It is sized like the geo boost, not like a content field.
    it('keeps the location tier below every content tier', () => {
        const bases = tierBaseByField(
            scoredShouldClauses('σχολεία Άργους'),
        );
        const located = buildSearchQuery(
            { query: 'σχολεία Άργους' },
            { ...NO_EXTRACTED_FILTERS, locationName: 'Άργος' }
        );
        const locationText = tierBaseByField(
            (unwrapRanking(located.query).inner?.bool?.must as estypes.QueryDslQueryContainer[])[0]
                .bool?.should as estypes.QueryDslQueryContainer[]
        ).locationText;

        expect(locationText).toBeGreaterThan(0);
        expect(locationText).toBeLessThan(bases.transcript);
    });

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

    // A separate nested clause from the transcript one, so the two can carry
    // different tiers: a subject the person spoke in is a far weaker answer than
    // one whose debate says the words.
    it('stays a clause of its own, apart from the transcript clause', () => {
        const should = scoredShouldClauses('Χάρης Δούκας');
        const speaker = nestedClauseOn(should, 'speaker_contributions.speaker_person_name');
        const transcript = nestedClauseOn(should, 'speaker_contributions.text');

        expect(speaker?.inner).not.toBe(transcript?.inner);
        expect(speaker!.base!).not.toBe(transcript!.base!);
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
        // 0.934 sits mid-way between the measured off-topic ceiling (0.9319, a
        // keyboard mash) and the measured paraphrase floor ([0.936, 0.940)) —
        // see DEFAULT_SEMANTIC_MIN_SCORE.
        expect(params.cutoff).toBe(0.934);
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

    // The ranking function only nudges an existing relevance score. It must not
    // reach the browse path, where it would become the sort key: its
    // administrative-body span is wider than its recency span, so a council
    // subject of any age would outrank a community subject from today.
    it('keeps the ranking function out of the filter-only branch', () => {
        const q = buildSearchQuery({ personIds: ['p1'] }, NO_EXTRACTED_FILTERS);

        expect(q.query?.function_score).toBeUndefined();

        const filter = (q.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
        expect(findPersonFilter(filter)).toBeDefined();
    });

    it('applies the ranking function multiplicatively on the text path', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);
        const functionScore = q.query?.function_score as estypes.QueryDslFunctionScoreQuery;

        expect(functionScore.boost_mode).toBe('multiply');
    });

    // Search and the app's standard subject ranking must agree on which body type
    // outranks which. They no longer agree by sharing numbers: rankSubjects
    // z-scores ADMIN_BODY_TIER, and a z-score is invariant to any affine rescale
    // of that column, so its magnitudes are free to move while its ordering
    // stays. Search reads the magnitudes, so it cannot follow them. The shared
    // property is the ordering — assert exactly that, and nothing more.
    it('orders administrative bodies the way the standard subject ranking does', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);
        const params = rankingScriptParams(q.query);
        const byDescending = (weights: Record<string, number>) =>
            Object.keys(weights).sort((a, b) => weights[b] - weights[a]);

        expect(byDescending({
            council: params.councilWeight,
            committee: params.committeeWeight,
            community: params.communityWeight,
        })).toEqual(byDescending(ADMIN_BODY_TIER));
    });

    // Each of the three factors is a boost that is never a penalty, and
    // rankingMultiplierRatio computes the multiplier's span from that: it
    // divides the ceilings by a floor of 1.0. A body type scoring below 1.0
    // would both penalise subjects the comment promises never to penalise and
    // make the tier-margin check report unsafe pairs as safe.
    it('floors every administrative-body weight at 1.0, so none is a penalty', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);
        const params = rankingScriptParams(q.query);

        for (const key of ['councilWeight', 'committeeWeight', 'communityWeight', 'defaultAdminBodyWeight']) {
            expect(params[key]).toBeGreaterThanOrEqual(1);
        }
    });

    // The decay scale is what makes recency a gentle preference for newer
    // meetings rather than a cliff. At RECENCY_DECAY_SCALE_DAYS old a meeting
    // keeps ~37% (1/e) of the boost, so a year-old meeting is still competitive
    // and a decade-old one has effectively lost the edge. A scale of days would
    // leave the whole archive tied at no boost at all, which the emitted number
    // alone does not show.
    it('decays recency over years, not days', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);
        const params = rankingScriptParams(q.query);
        const shareOfBoostLeft = (ageDays: number) =>
            Math.exp(-ageDays / params.recencyScaleDays);

        expect(shareOfBoostLeft(0)).toBe(1);
        expect(shareOfBoostLeft(365)).toBeGreaterThan(0.3);
        expect(shareOfBoostLeft(365 * 10)).toBeLessThan(0.01);
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
    // What one extracted place name actually resolves to: processFilters
    // geocodes it in every municipality, and adjacent Attica cities bias Google
    // Places towards the same landmark, so about ten near-identical points for
    // one place is the normal case, not an edge case.
    const SAME_PLACE_GEOCODED_TWICE = [
        { point: { lat: 38.0, lon: 23.7 }, radiusMeters: 2000 },
        { point: { lat: 38.0001, lon: 23.7001 }, radiusMeters: 2000 },
    ];

    // The proximity clause on the scored path: one constant_score whose filter
    // holds the geo clauses.
    function proximityClauseOf(q: ReturnType<typeof buildSearchQuery>) {
        const should = (lexicalQueryOf(q)?.bool?.should ?? []) as estypes.QueryDslQueryContainer[];
        expect(should).toHaveLength(1);
        return should[0].constant_score;
    }

    function geoClausesOf(q: ReturnType<typeof buildSearchQuery>) {
        const filter = proximityClauseOf(q)?.filter as estypes.QueryDslQueryContainer;
        return (filter?.bool?.should ?? []) as estypes.QueryDslQueryContainer[];
    }

    function lexicalQueryOf(q: ReturnType<typeof buildSearchQuery>) {
        return unwrapRanking(q.query).inner;
    }

    // The hard filters sit on the text core. With locations present, the scored
    // query wraps that core in one more bool (must: [core], should: geo), and
    // the wrapper carries no `filter` of its own — so reading `filter` off the
    // outer bool yields [] and asserts nothing. The `meeting_released` check
    // fails the test if this walk ever stops finding the real array again.
    function hardFiltersOf(q: ReturnType<typeof buildSearchQuery>): estypes.QueryDslQueryContainer[] {
        const outer = lexicalQueryOf(q)?.bool as BoolQuery;
        const core = outer.filter
            ? outer
            : ((outer.must as estypes.QueryDslQueryContainer[])[0].bool as BoolQuery);
        const filters = (core.filter ?? []) as estypes.QueryDslQueryContainer[];
        expect(filters.some((f) => f.term?.['meeting_released'] !== undefined)).toBe(true);
        return filters;
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

        expect(JSON.stringify(hardFiltersOf(q))).not.toContain('geo_distance');
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
        expect(must).toHaveLength(1);
        expect(geoClausesOf(q)[0]?.geo_distance).toMatchObject({ distance: '2000m' });
        expect(lexical?.bool?.minimum_should_match).toBeUndefined();
    });

    // Regression: the geo clauses used to sit in the scoring bool.should
    // directly, one per geocoded point, so their boosts SUMMED. One extracted
    // place resolves to about ten points across the Attica municipalities, so a
    // subject inside K radii collected K x LOCATION_BOOST — +20 at K=10, the
    // whole namePhrase tier and more than descriptionTerm. Proximity breaks ties
    // among text matches; it must not outrank a better text match.
    it('awards the proximity boost once, however many points one place geocoded to', () => {
        const one = buildSearchQuery(
            { query: 'πάρκα', locations: LOCATIONS },
            NO_EXTRACTED_FILTERS
        );
        const many = buildSearchQuery(
            { query: 'πάρκα', locations: SAME_PLACE_GEOCODED_TWICE },
            NO_EXTRACTED_FILTERS
        );

        // Both points are searched...
        expect(geoClausesOf(one)).toHaveLength(1);
        expect(geoClausesOf(many)).toHaveLength(2);
        // ...and being near either one is worth the same single boost. The geo
        // clauses carry no boost of their own, and they sit in the
        // constant_score's filter context, where a score cannot accumulate.
        expect(proximityClauseOf(one)?.boost).toBe(proximityClauseOf(many)?.boost);
        expect(JSON.stringify(geoClausesOf(many))).not.toContain('boost');
    });

    // The boost has to stay small next to the field tiers, or proximity stops
    // being a tiebreak: at the description tier every subject in the place
    // gained the same 15, which put tree cutting and a theatre booking above
    // school maintenance for "σχολεία Άργους".
    it('keeps the proximity boost below the weakest content tier', () => {
        const q = buildSearchQuery(
            { query: 'πάρκα', locations: LOCATIONS },
            NO_EXTRACTED_FILTERS
        );
        const bases = tierBaseByField(scoredShouldClauses('πάρκα'));

        expect(proximityClauseOf(q)?.boost).toBeLessThan(bases.transcript);
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
        const distance = geoClausesOf(q)[0]?.geo_distance?.distance as string;

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
        const filter = (q.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];

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

    // All of a field's spellings live inside ONE tier-wrapped clause, as a
    // dis_max (see anySpelling), so the spellings compete instead of summing.
    // This collects the query strings of that clause's branches per field, main
    // spelling included. Each spelling set emits a strict/partial pair, so this
    // reads the strict half only and the assertions stay about spellings — the
    // pairing itself is covered by its own describe block below.
    function exactTermQueries(clauses: estypes.QueryDslQueryContainer[], field: string): string[] {
        const queries: string[] = [];
        for (const c of clauses) {
            const inner = unflatten(c).inner;
            const branches = (inner?.dis_max?.queries ?? (inner ? [inner] : [])) as
                estypes.QueryDslQueryContainer[];
            for (const branch of branches) {
                const m = branch.match?.[field];
                if (typeof m === 'object' && m !== null && !('fuzziness' in m)
                    && typeof m.query === 'string' && m.minimum_should_match === '2<75%') {
                    queries.push(m.query);
                }
            }
        }
        return queries;
    }

    // Regression: each spelling used to be its own should-clause, and the
    // clauses shared one bool, so they summed. The spellings differ only in
    // their punctuated token, and the partial half of the pair needs just one
    // term, so a document matching one spelling in full also collected the other
    // spelling's partial share. Measured on this query, whose name clauses then
    // offered 80 base points against a nameTerm tier of 40: `Τιμολόγια ΔΕΥΑΧ`
    // scored 54, and `Τιμολόγια νερού` — which matches the common word and not
    // the acronym at all — scored 28, the whole introducer tier, for half a
    // match. dis_max with tie_breaker 0 takes the best spelling and drops the
    // rest, so the field can still only reach its tier.
    it('scores spellings against each other, never summed', () => {
        const clauses = lexicalShouldClauses('τιμολόγια Δ.Ε.Υ.Α.Χ.');

        const nameClauses = clauses
            .map(unflatten)
            .filter(({ inner }) =>
                (inner?.dis_max?.queries ?? []).some((b) => {
                    const m = b.match?.['name'];
                    // The fuzzy clause spells its query out too, and carries its
                    // own tier; the pair asserted below is the exact one.
                    return typeof m === 'object' && m !== null && !('fuzziness' in m);
                }));

        // One clause per half of the coverage pair, not one per spelling.
        expect(nameClauses).toHaveLength(2);
        for (const { inner } of nameClauses) {
            expect(inner!.dis_max!.tie_breaker).toBe(0);
            expect(inner!.dis_max!.queries).toHaveLength(2);
        }
        // The two halves still sum back to the whole tier, exactly as they do
        // for a query with no alternate spelling at all.
        expect(nameClauses[0].base! + nameClauses[1].base!).toBeCloseTo(40, 5);
    });

    it('wraps a single-spelling query in no dis_max at all', () => {
        const clauses = lexicalShouldClauses('πάρκα');
        const nameTerm = tierClauseOn(clauses, (inner) => {
            const m = inner.match?.['name'];
            return typeof m === 'object' && m !== null && !('fuzziness' in m);
        });

        expect(nameTerm?.inner?.dis_max).toBeUndefined();
    });

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

    // Regression: only the name, description and location_text term clauses read
    // the spellings. The phrases, the fuzzy name clause, both transcript clauses,
    // both speaker-name clauses and the introducer clause all queried the raw
    // text, so `Τιμολόγια ΔΕΥΑΧ` — the spelling the index actually holds — could
    // reach the nameTerm tier and nothing else, a 28-point gap decided by index
    // punctuation. Worse, the gate admits a transcript-only match on the glued
    // spelling that the dotted transcript clause could not then score, and
    // minimum_should_match 1 dropped it.
    it('offers every clause family both spellings, not the term clauses alone', () => {
        const clauses = lexicalShouldClauses('τιμολόγια Δ.Ε.Υ.Α.Χ.');
        const spellings = new Set(['τιμολόγια ΔΕΥΑΧ.', 'τιμολόγια Δ.Ε.Υ.Α.Χ.']);

        expect(clauses.length).toBeGreaterThan(0);
        for (const clause of clauses) {
            expect(new Set(queryTextsOf(unflatten(clause).inner))).toEqual(spellings);
        }
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
        'builds a filter-only query sorted newest-first when query is %p',
        (query) => {
            const q = buildSearchQuery(
                {
                    query,
                    personIds: ['p1'],
                    dateRange: { start: '2026-07-01', end: '2026-07-31' },
                },
                NO_EXTRACTED_FILTERS
            );

            // No text clauses (they require query text), and no scoring at all:
            // an explicit sort orders the listing.
            expect(q.retriever).toBeUndefined();
            expect(q.query?.function_score).toBeUndefined();
            // `Sort` also allows a bare (non-array) form; buildSearchQuery always
            // emits the array form.
            const sort = q.sort as estypes.SortCombinations[];
            expect(sort[0]).toEqual({ 'meeting_date': { order: 'desc' } });

            const filter = (q.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
            expect(filter.some((f) => f.term?.['meeting_released'] !== undefined)).toBe(true);
            expect(findPersonFilter(filter)).toBeDefined();
            expect(filter.some((f) => f.range?.['meeting_date'] !== undefined)).toBe(true);
        }
    );

    // Every subject of one meeting shares its meeting_date, so the date alone
    // leaves large groups tied. Elasticsearch orders tied documents arbitrarily,
    // which lets paging repeat one subject and skip another.
    it('breaks meeting_date ties on a unique key so paging stays stable', () => {
        const q = buildSearchQuery({ personIds: ['p1'] }, NO_EXTRACTED_FILTERS);

        expect(q.sort).toEqual([
            { 'meeting_date': { order: 'desc' } },
            { 'id': { order: 'asc' } },
        ]);
    });

    it('respects pagination config in the filter-only branch', () => {
        const q = buildSearchQuery({ config: { size: 5, from: 10 } }, NO_EXTRACTED_FILTERS);

        expect(q.size).toBe(5);
        expect(q.from).toBe(10);
    });

    // Both branches page, and both report a total. The API route divides the
    // total by the page size, so a request that stops tracking totals — or a
    // scored branch that hardcodes from: 0 — hands every page the first ten
    // results and a page count of NaN.
    const pagedRequests: [string, SearchRequest][] = [
        ['scored', { query: 'πάρκα', config: { size: 5, from: 10 } }],
        ['filter-only', { personIds: ['p1'], config: { size: 5, from: 10 } }],
    ];
    it.each(pagedRequests)('pages the %s branch and counts every hit behind it', (_branch, request) => {
        const q = buildSearchQuery(request, NO_EXTRACTED_FILTERS);

        expect(q.size).toBe(5);
        expect(q.from).toBe(10);
        expect(q.track_total_hits).toBe(true);
    });
});

// The per-field term requirement could not express "the query is covered by the
// document", only "the query is covered by THIS field". These cover the split
// that replaced it: a per-document gate for precision, graded per-field tiers
// for evidence weighting.
describe('buildSearchQuery cross-field coverage', () => {
    // The gate lives in filter context on the lexical bool, so it decides
    // eligibility without contributing score.
    function coverageGate(query: string): BoolQuery {
        const filter = (textArms(query).lexical?.filter ?? []) as estypes.QueryDslQueryContainer[];
        expect(filter).toHaveLength(1);
        return filter[0].bool as BoolQuery;
    }
    const gateAlternatives = (query: string) =>
        (coverageGate(query).should ?? []) as estypes.QueryDslQueryContainer[];

    it('gates on the document, not on any single field', () => {
        const combined = gateAlternatives('Ιωάννης Μαλτέζος υδρονομείς')
            .map(c => c.combined_fields)
            .filter(Boolean);

        // One combined_fields over the flat fields: a two-word name can satisfy
        // the term requirement alone per field, but the requirement is asked
        // once across their union here.
        expect(combined).toHaveLength(1);
        expect(combined[0]!.fields).toEqual([
            'name', 'description', 'introduced_by_person_name', 'location_text'
        ]);
        expect(combined[0]!.minimum_should_match).toBe('2<75%');
    });

    // Regression: the nested speaker-name alternative decides eligibility on its
    // own, so at 2-of-3 the two-word name "Ιωάννης Μαλτέζος" admitted every
    // subject the person merely spoke in — none of which match the topic word.
    // Ranking put them last (FIELD_TIER.speakerName), but they still filled
    // track_total_hits and the pages behind the real matches.
    it('makes a speaker name cover the whole query before it admits a document', () => {
        const speakerGate = (query: string) => {
            const nested = gateAlternatives(query)
                .map(c => c.nested?.query?.bool?.should as estypes.QueryDslQueryContainer[])
                .find(Boolean);
            return nested?.find(c => c.match?.['speaker_contributions.speaker_person_name']);
        };

        expect(minimumShouldMatchOf(speakerGate('Ιωάννης Μαλτέζος υδρονομείς'))).toBe('100%');
        // The transcript alternative keeps the ordinary threshold: a contribution
        // covering 2 of 3 terms is a real coverage claim, a name is not.
        const transcript = gateAlternatives('Ιωάννης Μαλτέζος υδρονομείς')
            .map(c => c.nested?.query?.bool?.should as estypes.QueryDslQueryContainer[])
            .find(Boolean)
            ?.find(c => c.match?.['speaker_contributions.text']);
        expect(minimumShouldMatchOf(transcript)).toBe('2<75%');
    });

    // The clause exists to answer a bare person-name query with the subjects the
    // person spoke in ("Χάρης Δούκας" 38 -> 110 hits on the production index).
    // '100%' keeps that: the name covers the whole query, so those subjects
    // still qualify. Only person-plus-topic queries have to find their topic
    // term somewhere else.
    it('still admits the subjects a person spoke in for a bare name query', () => {
        const clauses = gateAlternatives('Χάρης Δούκας');
        const speaker = clauses
            .map(c => c.nested?.query?.bool?.should as estypes.QueryDslQueryContainer[])
            .find(Boolean)
            ?.find(c => c.match?.['speaker_contributions.speaker_person_name']);

        expect(speaker?.match?.['speaker_contributions.speaker_person_name'])
            .toMatchObject({ query: 'Χάρης Δούκας', minimum_should_match: '100%' });
    });

    it('keeps the gate out of the scoring path', () => {
        const lexical = textArms('πάρκα Κυψέλης').lexical!;
        // filter context contributes no score; every point comes from the
        // tiered should-clauses, and msm 1 keeps a gate-only match out.
        expect((lexical.filter as estypes.QueryDslQueryContainer[])).toHaveLength(1);
        expect(lexical.minimum_should_match).toBe(1);
        expect((lexical.should as estypes.QueryDslQueryContainer[]).length).toBeGreaterThan(0);
    });

    it('lets the gate admit everything the scoring clauses can match', () => {
        const alternatives = gateAlternatives('ανακίκλωση');
        // A typo query matches nothing exactly, so without a fuzzy alternative
        // the gate would reject it before the fuzzy name clause could score it.
        const fuzzy = alternatives.find(c => {
            const m = c.match?.['name'];
            return typeof m === 'object' && m !== null && 'fuzziness' in m;
        });
        expect(fuzzy).toBeDefined();
        // Nested fields cannot join a combined_fields, so transcript and
        // speaker name are their own alternatives.
        expect(alternatives.some(c => c.nested?.path === 'speaker_contributions')).toBe(true);
    });

    it('gates each alternate spelling, so a variant-only match is not rejected first', () => {
        // Δ.Ε.Υ.Α.Χ. is indexed plain, so gating the dotted spelling alone
        // would reject the query before its variant clauses could score it.
        // Only dots BETWEEN letters are stripped, so the trailing one stays.
        const spellings = ['ΔΕΥΑΧ.', 'Δ.Ε.Υ.Α.Χ.'];
        const alternatives = gateAlternatives('Δ.Ε.Υ.Α.Χ.');

        // Every alternative of the gate, not only the combined_fields one: a
        // spelling the gate admits on one alternative and rejects on another is
        // a document the scoring clauses never see.
        expect(alternatives.map(c => c.combined_fields?.query).filter(Boolean)).toEqual(spellings);
        expect(alternatives.filter(c => c.match?.['name']).flatMap(queryTextsOf)).toEqual(spellings);
        expect(alternatives.filter(c => c.nested).flatMap(queryTextsOf))
            .toEqual([spellings[0], spellings[0], spellings[1], spellings[1]]);
    });

    it('scores partial field coverage below full coverage in the same tier', () => {
        const [strict, partial] = termPair('Ιωάννης Μαλτέζος υδρονομείς', 'name');

        expect(strict.inner?.match?.['name']).toMatchObject({ minimum_should_match: '2<75%' });
        expect(partial.inner?.match?.['name']).toMatchObject({ minimum_should_match: 1 });
        // Covering part of the query now scores the tier's partial share
        // instead of nothing, and stays below a full match in the same tier.
        expect(partial.base!).toBeLessThan(strict.base!);
        // Both fire on a full match, so the tier value is unchanged from before
        // the split — the whole existing calibration carries over.
        expect(strict.base! + partial.base!).toBeCloseTo(40, 5);
    });

    it('gives the introducer field the same graded treatment', () => {
        const [strict, partial] = termPair('Ιωάννης Μαλτέζος υδρονομείς', 'introduced_by_person_name');

        // Before the split, a query sharing only a first name with the
        // introducer scored the same as the full name.
        expect(partial.base!).toBeLessThan(strict.base!);
        expect(strict.base! + partial.base!).toBeCloseTo(28, 5);
    });

    it('scores location_text against the extracted location, not the query text', () => {
        const q = buildSearchQuery(
            { query: 'σχολεία Άργους' },
            { ...NO_EXTRACTED_FILTERS, locationName: 'Άργος' }
        );
        const { inner } = unwrapRanking(q.query);
        // Semantic search is off by default here, so the lexical bool stands
        // alone under `must` rather than inside a dis_max.
        const textClause = ((inner?.bool as BoolQuery).must as estypes.QueryDslQueryContainer[])[0];
        const lexical = textClause.bool as BoolQuery;
        const loc = (lexical.should as estypes.QueryDslQueryContainer[])
            .map(unflatten)
            .filter(({ inner: i }) => i?.match?.['location_text']);

        expect(loc.length).toBeGreaterThan(0);
        // An address holds a place, so asking it to answer the topic word too
        // left the clause silent for the subjects actually in the place.
        for (const { inner: i } of loc) {
            expect(i!.match!['location_text']).toMatchObject({ query: 'Άργος' });
        }
    });

    it('adds no location clause when the AI extracted no location', () => {
        const clauses = scoredShouldClauses('σχολεία Άργους');
        expect(clauses.map(unflatten).filter(({ inner }) => inner?.match?.['location_text'])).toHaveLength(0);
    });

    // The extractor is as free to return a Greek tonos or a smart quote as a
    // mobile keyboard is, and an unnormalized spelling tokenizes differently
    // from the indexed location_text — which drops the location tier out of the
    // ranking in silence, since the gate scores the whole query and never
    // notices. The location name gets the same treatment as the query text.
    it('normalizes the extracted location name and spells out its variants', () => {
        const q = buildSearchQuery(
            { query: 'μπαρ' },
            { ...NO_EXTRACTED_FILTERS, locationName: 'ΔΙ΄ΕΥΧΩΝ' }
        );
        const { inner } = unwrapRanking(q.query);
        const textClause = ((inner?.bool as BoolQuery).must as estypes.QueryDslQueryContainer[])[0];
        const should = ((textClause.bool as BoolQuery).should ?? []) as estypes.QueryDslQueryContainer[];

        const branches = should
            .map(unflatten)
            .flatMap(({ inner: i }) => (i?.dis_max?.queries ?? []) as estypes.QueryDslQueryContainer[])
            .filter((b) => b.match?.['location_text'] !== undefined);

        const spellings = branches.map((b) => {
            const m = b.match!['location_text'];
            return typeof m === 'object' && m !== null ? m.query : undefined;
        });
        // The tonos is normalized to an ASCII apostrophe, then the space-split
        // variant reaches the spelling the index actually holds.
        expect(new Set(spellings)).toEqual(new Set(['ΔΙ ΕΥΧΩΝ', "ΔΙ'ΕΥΧΩΝ"]));
    });
});


// The query names fields and reads doc values; the index has to hold both.
// Nothing between the two is typed, so a renamed field, a field that lost its
// doc values, or a param the script asks for and never receives fails at query
// time on the live index and nowhere else.
describe('buildSearchQuery agreement with the index mapping', () => {
    type Json = { [key: string]: unknown };
    const isObject = (value: unknown): value is Json =>
        typeof value === 'object' && value !== null && !Array.isArray(value);

    const MAPPING = schema[0].mapping as unknown as Json;

    // Resolves a dotted path through the mapping's `properties` (nested objects)
    // and `fields` (multi-fields, e.g. name.semantic) levels.
    function mappingOf(path: string): Json | undefined {
        let level: Json | undefined = MAPPING;
        let node: Json | undefined;
        for (const part of path.split('.')) {
            const next: unknown = level?.[part];
            if (!isObject(next)) return undefined;
            node = next;
            const properties: Json | undefined = isObject(node.properties) ? node.properties : undefined;
            const fields: Json | undefined = isObject(node.fields) ? node.fields : undefined;
            level = properties ?? fields;
        }
        return node;
    }

    // Every index field the query names, collected per clause type rather than by
    // sweeping keys, so a structural key ("bool", "should") can never be read as
    // a field name.
    function fieldsNamedBy(node: unknown): string[] {
        if (Array.isArray(node)) return node.flatMap(fieldsNamedBy);
        if (!isObject(node)) return [];
        const found: string[] = [];
        for (const [key, value] of Object.entries(node)) {
            if (isObject(value)) {
                if (key === 'match' || key === 'match_phrase' || key === 'term'
                    || key === 'terms' || key === 'range') {
                    found.push(...Object.keys(value));
                } else if (key === 'combined_fields' && Array.isArray(value.fields)) {
                    found.push(...value.fields.filter((f): f is string => typeof f === 'string'));
                } else if (key === 'nested' && typeof value.path === 'string') {
                    found.push(value.path);
                } else if (key === 'geo_distance') {
                    found.push(...Object.keys(value).filter(k => k !== 'distance' && k !== 'boost'));
                } else if (key === 'semantic' && typeof value.field === 'string') {
                    found.push(value.field);
                }
            }
            found.push(...fieldsNamedBy(value));
        }
        return found;
    }

    // Every script_score the query carries, with the params it was given.
    function scriptsOf(node: unknown): { source: string; params: Json }[] {
        if (Array.isArray(node)) return node.flatMap(scriptsOf);
        if (!isObject(node)) return [];
        const found: { source: string; params: Json }[] = [];
        const scriptScore = isObject(node.script_score) ? node.script_score : undefined;
        const script = scriptScore && isObject(scriptScore.script) ? scriptScore.script : undefined;
        if (script && typeof script.source === 'string') {
            found.push({ source: script.source, params: isObject(script.params) ? script.params : {} });
        }
        for (const value of Object.values(node)) found.push(...scriptsOf(value));
        return found;
    }

    // One request that reaches every clause the builder can emit.
    const everyClause = () => buildSearchQuery(
        {
            query: 'Χάρης Δούκας ανακύκλωση',
            cityIds: ['athens'],
            personIds: ['p1'],
            partyIds: ['party1'],
            topicIds: ['t1'],
            dateRange: { start: '2026-01-01', end: '2026-02-01' },
            locations: [{ point: { lat: 38.0, lon: 23.7 }, radiusMeters: 2000 }],
            config: { enableSemanticSearch: true },
        },
        { ...NO_EXTRACTED_FILTERS, locationName: 'Άργος' }
    );

    it('names only fields the index mapping defines', () => {
        const fields = new Set(fieldsNamedBy(everyClause().query));

        // Guards the walker itself: a shape change that stopped it finding
        // fields would otherwise turn this test into an empty loop.
        expect(fields.size).toBeGreaterThan(10);
        for (const field of fields) {
            expect({ field, mapped: mappingOf(field) !== undefined })
                .toEqual({ field, mapped: true });
        }
    });

    it('sorts the browse listing on fields the index mapping defines', () => {
        const sort = buildSearchQuery({ personIds: ['p1'] }, NO_EXTRACTED_FILTERS)
            .sort as estypes.SortCombinations[];

        const fields = sort.flatMap(entry => (isObject(entry) ? Object.keys(entry) : []));
        expect(fields.length).toBeGreaterThan(0);
        for (const field of fields) {
            expect({ field, mapped: mappingOf(field) !== undefined })
                .toEqual({ field, mapped: true });
        }
    });

    // combined_fields treats its fields as one combined field, so Elasticsearch
    // rejects the query outright unless they share an analyzer.
    it('gates on fields that share one analyzer', () => {
        const filter = (textArms('πάρκα Κυψέλης').lexical?.filter ?? []) as estypes.QueryDslQueryContainer[];
        const combined = ((filter[0].bool?.should ?? []) as estypes.QueryDslQueryContainer[])
            .map(c => c.combined_fields)
            .find(Boolean)!;

        const analyzers = combined.fields.map(field => mappingOf(field)?.analyzer);
        expect(analyzers).toHaveLength(4);
        expect(new Set(analyzers)).toEqual(new Set(['greek']));
    });

    // The ranking script reads doc values directly. A `text` field has none, and
    // a renamed field returns nothing, so either one throws per document at
    // query time. This checks the field names and the types the script's own
    // operations require; only a run against a live index checks the Painless.
    it('reads doc fields the index can serve at scoring time', () => {
        const { functionScore } = unwrapRanking(buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS).query);
        const fn = functionScore.functions?.[0] as estypes.QueryDslFunctionScoreContainer;
        const source = (fn.script_score?.script as estypes.Script).source as string;

        const docFields = [...source.matchAll(/doc\['([^']+)'\]/g)].map(m => m[1]);
        expect(docFields.length).toBeGreaterThan(0);
        for (const field of docFields) {
            const mapping = mappingOf(field);
            expect({ field, mapped: mapping !== undefined }).toEqual({ field, mapped: true });
            expect({ field, type: mapping!.type }).not.toEqual({ field, type: 'text' });
        }

        // The operations the script performs on each one.
        expect(mappingOf('administrative_body_type')!.type).toBe('keyword');
        expect(mappingOf('meeting_date')!.type).toBe('date');
        expect(['float', 'double', 'long', 'integer'])
            .toContain(mappingOf('discussion_speaking_seconds')!.type);
    });

    it('gives every script exactly the params it reads', () => {
        const scripts = scriptsOf(everyClause().query);

        expect(scripts.length).toBeGreaterThan(1);
        for (const { source, params } of scripts) {
            const referenced = [...new Set([...source.matchAll(/params\.(\w+)/g)].map(m => m[1]))];
            expect(referenced.sort()).toEqual(Object.keys(params).sort());
        }
    });
});

describe('buildSearchQuery city filter', () => {
    // search() (../index.ts) caps the city ids to the realm of the request
    // before it calls buildSearchQuery, and it caps the AI-extracted ids the
    // same way. Re-merging the raw extracted ids here would put a municipality
    // of another realm back into the filter, past that cap.
    function cityIdsOf(q: ReturnType<typeof buildSearchQuery>): string[] | undefined {
        const { inner } = unwrapRanking(q.query);
        const filters = (inner.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
        return filters.find((f) => f.terms?.['city_id'])?.terms?.['city_id'] as string[] | undefined;
    }

    it('filters on the city ids of the request', () => {
        const q = buildSearchQuery({ query: 'πάρκα', cityIds: ['athens'] }, NO_EXTRACTED_FILTERS);

        expect(cityIdsOf(q)).toEqual(['athens']);
    });

    it('does not let extracted city ids replace the ids of the request', () => {
        const q = buildSearchQuery(
            { query: 'πάρκα στο Παρίσι', cityIds: ['athens'] },
            { ...NO_EXTRACTED_FILTERS, cityIds: ['paris'] }
        );

        expect(cityIdsOf(q)).toEqual(['athens']);
    });
});

describe('buildFilters administrative body filter', () => {
    // The two fields reached the URL and the filter bar before buildFilters had
    // a clause for either, so every administrative body selection returned the
    // unfiltered results.
    function termsOf(
        filters: estypes.QueryDslQueryContainer[],
        field: string
    ): string[] | undefined {
        return filters.find((f) => f.terms?.[field])?.terms?.[field] as string[] | undefined;
    }

    it('filters on the ids of named administrative bodies', () => {
        const filters = buildFilters({ query: 'roads', adminBodyIds: ['body1'] });

        expect(termsOf(filters, 'administrative_body_id')).toEqual(['body1']);
    });

    it('filters on the administrative body type', () => {
        const filters = buildFilters({ query: 'roads', adminBodyTypes: ['committee'] });

        expect(termsOf(filters, 'administrative_body_type')).toEqual(['committee']);
    });

    it('keeps the id and the type as independent top-level (AND) clauses', () => {
        const filters = buildFilters({
            query: 'roads',
            adminBodyIds: ['body1'],
            adminBodyTypes: ['committee'],
        });

        expect(termsOf(filters, 'administrative_body_id')).toEqual(['body1']);
        expect(termsOf(filters, 'administrative_body_type')).toEqual(['committee']);
    });

    it('omits both clauses when no administrative body is given', () => {
        const filters = buildFilters({ query: 'roads' });

        expect(termsOf(filters, 'administrative_body_id')).toBeUndefined();
        expect(termsOf(filters, 'administrative_body_type')).toBeUndefined();
    });

    it('omits both clauses for empty arrays', () => {
        const filters = buildFilters({ query: 'roads', adminBodyIds: [], adminBodyTypes: [] });

        expect(termsOf(filters, 'administrative_body_id')).toBeUndefined();
        expect(termsOf(filters, 'administrative_body_type')).toBeUndefined();
    });
});
