/**
 * Search ranking eval harness. Runs a labeled query set against the live
 * Elasticsearch index through buildSearchQuery (the exact production query
 * builder) and prints ranked results for manual + automatic judgment.
 *
 * Read-only: only _search calls. AI filter extraction is deliberately
 * bypassed (NO_EXTRACTED_FILTERS) — this evaluates ES ranking in isolation.
 *
 * Usage:
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts                    # full suite
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --mode lexical     # lexical arm only
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --query "..."      # one ad-hoc query
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --min-score 0.94   # sweep the semantic cutoff
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --tier-margin      # field-tier ordering
 */
// Must stay the FIRST import: it loads .env before `../src/lib/search/query`
// initialises `@/env.mjs`. See scripts/search-eval-env.ts.
import './search-eval-env';

import { Client, estypes } from '@elastic/elasticsearch';
import { buildSearchQuery, rankingMultiplierRatio, MAX_RANKING_MULTIPLIER_RATIO } from '../src/lib/search/query';
import type { ExtractedFilters, SearchRequest } from '../src/lib/search/types';

const NO_EXTRACTED_FILTERS: ExtractedFilters = {
    cityIds: null,
    dateRange: null,
    isLatest: null,
    locationName: null,
};

type Expectation = 'results' | 'empty';

interface EvalCase {
    query: string;
    expect: Expectation;
    note: string;
}

const CASES: EvalCase[] = [
    // Common municipal topics — must return results
    { query: 'ανακύκλωση', expect: 'results', note: 'recycling' },
    { query: 'ποδηλατόδρομοι', expect: 'results', note: 'bike lanes' },
    { query: 'άδεια μουσικής', expect: 'results', note: 'music license (very common agenda item)' },
    { query: 'προϋπολογισμός', expect: 'results', note: 'budget' },
    { query: 'αδέσποτα ζώα', expect: 'results', note: 'stray animals' },
    { query: 'ανάπλαση πλατείας', expect: 'results', note: 'square regeneration' },
    { query: 'ύδρευση', expect: 'results', note: 'water supply' },
    { query: 'στάθμευση', expect: 'results', note: 'parking' },
    { query: 'πυροπροστασία', expect: 'results', note: 'fire protection' },
    { query: 'κυκλοφοριακές ρυθμίσεις', expect: 'results', note: 'traffic arrangements' },
    { query: 'σχολεία', expect: 'results', note: 'schools' },
    // Robustness: typos and missing accents
    { query: 'ανακίκλωση', expect: 'results', note: 'typo: recycling (ι for υ)' },
    { query: 'ποδηλατοδρομοι', expect: 'results', note: 'unaccented bike lanes' },
    { query: 'σταθμευση αναπηρικων', expect: 'results', note: 'unaccented disabled parking' },
    // Real logged user searches (SearchQuery table) that must return results
    { query: 'παιδικοί σταθμοί', expect: 'results', note: 'logged user query: kindergartens' },
    { query: 'καθαριότητα', expect: 'results', note: 'logged user query: cleanliness' },
    { query: 'σκουπίδια', expect: 'results', note: 'logged user query: garbage colloquial' },
    { query: 'χώροι πρασίνου', expect: 'results', note: 'logged user query: green spaces' },
    { query: 'κολυμβητήριο', expect: 'results', note: 'logged user query: swimming pool' },
    { query: 'υδρονομείς', expect: 'results', note: 'logged user query: irrigation wardens' },
    { query: 'πάρκινγκ', expect: 'results', note: 'logged user query: parking loanword' },
    { query: 'ηλεκτρικά πατίνια', expect: 'results', note: 'logged user query: e-scooters' },
    { query: 'μετρό', expect: 'results', note: 'logged user query: metro' },
    { query: 'υπολογιστές', expect: 'results', note: 'logged user query: computers (procurement)' },
    { query: 'διαγρραφή τελών', expect: 'results', note: 'logged user typo: double ρ' },
    { query: 'παιδικοί σταθ', expect: 'results', note: 'logged mid-typing partial (search-as-you-type)' },
    { query: 'τι αποφάσισε το δημοτικό συμβούλιο για τα πάρκα', expect: 'results', note: 'logged natural-language query' },
    // A title match must survive AI location extraction: "παλαιστίνη" used to
    // return zero when the AI extracted it as a location and the resulting
    // geo filter dropped every pin-less subject (the harness bypasses the AI,
    // so this case guards the lexical path; the unit tests cover the filter).
    { query: 'παλαιστίνη', expect: 'results', note: 'logged user query: exists in titles' },
    // Apostrophe variants: doc names use the Greek tonos (ΔΙ΄ΕΥΧΩΝ), users
    // type ASCII or smart quotes. All variants must return the same subjects.
    { query: "δι'ευχών", expect: 'results', note: 'bar name, ASCII apostrophe' },
    { query: 'δι’ευχών', expect: 'results', note: 'bar name, smart quote (mobile keyboards)' },
    // Dotted acronyms: long ones are indexed plain (ΔΕΥΑΧ), so the glued
    // variant must reach them; short dotted ones (Δ.Ε.Ρ.Τ.Ο.) match intact.
    { query: 'Δ.Ε.Υ.Α.Χ.', expect: 'results', note: 'dotted acronym, indexed plain' },
    { query: 'Δ.Ε.Ρ.Τ.Ο.', expect: 'results', note: 'dotted acronym, indexed dotted' },
    // Person names (logged user queries). The subjects the person introduced
    // lead, via introduced_by_person_name; the ones they only spoke in follow,
    // via the much weaker speaker_person_name clause (FIELD_TIER.speakerName).
    // The expectations below only assert non-empty — check the printed order by
    // eye when either tier changes.
    { query: 'Χάρης Δούκας', expect: 'results', note: 'logged user query: Athens mayor' },
    { query: 'Μαλτέζος', expect: 'results', note: 'logged user query: councillor surname' },
    { query: 'του Δούκα', expect: 'results', note: 'genitive declension of Δούκας' },
    // Cross-field queries: the terms live in DIFFERENT fields, so no single
    // field holds the whole query. Before the coverage gate, the per-field term
    // requirement made these degenerate — a two-word name satisfied a 3-term
    // query on its own, so "<person> <topic>" returned the same subjects in the
    // same order for every topic word. Check the printed order by eye: the
    // subject matching BOTH the person and the topic must lead.
    { query: 'Ιωάννης Μαλτέζος υδρονομείς', expect: 'results', note: 'person + topic; exactly 1 subject matches all 3 terms, it must rank 1st' },
    { query: 'Χάρης Δούκας ανακύκλωση', expect: 'results', note: 'person + topic where NO subject covers all 3 terms: must degrade to his subjects, not go empty' },
    { query: 'Μαλτέζος προϋπολογισμός', expect: 'results', note: 'surname + topic (2 terms, both fields needed)' },
    // Paraphrases: no shared stems with likely doc wording — semantic-only
    // recall. These guard the semantic cutoff from being raised too far.
    { query: 'διαχείριση σκουπιδιών', expect: 'results', note: 'paraphrase: garbage (docs say απορρίμματα)' },
    { query: 'χώροι για παρκάρισμα', expect: 'results', note: 'paraphrase: parking colloquial' },
    { query: 'λεφτά για τον αθλητισμό', expect: 'results', note: 'paraphrase: sports funding colloquial' },
    { query: 'ζώα χωρίς ιδιοκτήτη', expect: 'results', note: 'paraphrase: stray animals' },
    { query: 'βοήθεια σε φτωχούς', expect: 'results', note: 'paraphrase: welfare' },
    // Junk — must return zero results
    { query: 'lava', expect: 'empty', note: 'the canonical bug report' },
    { query: 'bitcoin mining', expect: 'empty', note: 'off-topic English' },
    { query: 'συνταγή για μουσακά', expect: 'empty', note: 'moussaka recipe' },
    { query: 'πτήσεις για Λονδίνο φθηνά εισιτήρια', expect: 'empty', note: 'cheap flights to London' },
    { query: 'quantum entanglement homework', expect: 'empty', note: 'off-topic English' },
    { query: 'ηφαίστειο έκρηξη λάβα', expect: 'empty', note: 'volcano eruption lava (Greek)' },
    { query: 'Taylor Swift συναυλία', expect: 'empty', note: 'celebrity concert' },
    { query: 'πώς να φτιάξω κέικ', expect: 'empty', note: 'how to make a cake' },
    // Junk actually typed by real users (SearchQuery table)
    { query: 'lava cake', expect: 'empty', note: 'logged junk: the lava bug, extended' },
    { query: 'pizza margherita', expect: 'empty', note: 'logged junk' },
    { query: 'ηνκξκ', expect: 'empty', note: 'logged junk: keyboard mash (Greek)' },
    { query: 'asdfqwer', expect: 'empty', note: 'logged junk: keyboard mash (Latin)' },
];

interface HitRow {
    score: number;
    name: string;
    city: string;
    body: string;
    date: string;
    minutes: number;
    matched: string; // N=name D=description
}

const client = new Client({
    node: process.env.ELASTICSEARCH_URL!,
    auth: { apiKey: process.env.ELASTICSEARCH_API_KEY! },
});

// The _source fields this harness asks for. Narrower than SubjectDocument on
// purpose: every field here is one the printed rows read.
interface EvalSource {
    id?: string;
    name?: string;
    city_name?: string;
    administrative_body_type?: string;
    meeting_date?: string;
    discussion_speaking_seconds?: number;
}

// Unwraps applyRanking's function_score to the query it multiplies. The
// container type also allows a bare function array; buildSearchQuery always
// emits the full query form.
function rankedQueryOf(
    query: estypes.QueryDslQueryContainer | undefined
): estypes.QueryDslQueryContainer | undefined {
    const functionScore = query?.function_score;
    return functionScore && !Array.isArray(functionScore) ? functionScore.query : undefined;
}

// The dis_max holding [lexical, semantic] (see buildSearchQuery). Absent when
// semantic search is off, and one level deeper when location boosts wrap the
// text core.
function textDisMaxOf(
    query: estypes.QueryDslQueryContainer | undefined
): estypes.QueryDslDisMaxQuery | undefined {
    const must = (query?.bool?.must ?? []) as estypes.QueryDslQueryContainer[];
    return must.find((c) => c.dis_max)?.dis_max;
}

// The bool carrying the tiered should-clauses, in either shape the builder
// emits: the first branch of the dis_max when the semantic arm is on, and the
// text clause itself when it is off.
function lexicalBoolOf(
    query: estypes.QueryDslQueryContainer | undefined
): estypes.QueryDslBoolQuery | undefined {
    const must = (rankedQueryOf(query)?.bool?.must ?? []) as estypes.QueryDslQueryContainer[];
    const textClause = must[0];
    return (textClause?.dis_max?.queries?.[0] ?? textClause)?.bool;
}

function markMatched(hit: estypes.SearchHit<EvalSource>): string {
    const highlight = hit.highlight ?? {};
    let m = '';
    if (highlight['name']) m += 'N';
    if (highlight['description']) m += 'D';
    return m || '·';
}

async function runQuery(
    queryText: string,
    mode: 'full' | 'lexical' | 'semantic',
    semanticMinScore?: number,
    size = 10
): Promise<{ total: number; rows: HitRow[] }> {
    const request: SearchRequest = {
        query: queryText,
        config: {
            size,
            enableSemanticSearch: mode !== 'lexical',
            // Left undefined unless --min-score was passed, so the default run
            // measures DEFAULT_SEMANTIC_MIN_SCORE exactly as production applies it.
            semanticMinScore,
        },
    };
    const q = buildSearchQuery(request, NO_EXTRACTED_FILTERS);

    // Semantic-only mode: the semantic side is the second branch of the dis_max
    // under `must` (see buildSemanticFallbackQuery). Keep only that branch so
    // its mapped scores and survivors are visible in isolation.
    if (mode === 'semantic') {
        const textCore = rankedQueryOf(q.query);
        const disMax = textDisMaxOf(textCore);
        const semantic = disMax?.queries.find((c) => c.function_score);
        if (!disMax || !textCore || !semantic) throw new Error('semantic fallback branch missing');
        disMax.queries = [semantic];
        // Lift the text core out of applyRanking. This mode exists to calibrate
        // SEMANTIC_MAPPED_BASE and SEMANTIC_MAPPED_SCALE, and the multiplier
        // (boost_mode multiply, up to ~1.48x) makes the printed numbers unusable
        // for that: a document sitting exactly at the cutoff maps to 26 and
        // prints anywhere between 26.0 and ~38.6. Which documents survive is
        // unaffected either way — min_score gates inside the semantic clause,
        // before the outer multiply.
        q.query = textCore;
    }

    const res = await client.search<EvalSource>({
        ...q,
        _source: [
            'id', 'name', 'city_name', 'administrative_body_type',
            'meeting_date', 'discussion_speaking_seconds',
        ],
        highlight: {
            fields: { name: {}, description: {} },
            pre_tags: ['«'], post_tags: ['»'],
        },
    });
    const rows: HitRow[] = res.hits.hits.map((h) => ({
        score: h._score ?? 0,
        name: (h._source?.name ?? '(no name)').slice(0, 78),
        city: h._source?.city_name ?? '?',
        body: h._source?.administrative_body_type ?? '—',
        date: (h._source?.meeting_date ?? '').slice(0, 10),
        minutes: Math.round((h._source?.discussion_speaking_seconds ?? 0) / 60),
        matched: markMatched(h),
    }));
    const total = res.hits.total;
    return { total: typeof total === 'number' ? total : total?.value ?? 0, rows };
}

function printRows(rows: HitRow[]) {
    for (const [i, r] of rows.entries()) {
        console.log(
            `   ${String(i + 1).padStart(2)}. [${r.matched.padEnd(3)}] ${r.score.toFixed(2).padStart(7)} ${r.date} ${r.body.padEnd(9)} ` +
            `${String(r.minutes).padStart(3)}m ${r.city.padEnd(10).slice(0, 10)} ${r.name}`
        );
    }
}

/**
 * Tier-margin check: is name dominance still holding, and is it still only the
 * data holding it?
 *
 * The lexical clauses share one bool.should, so a document scores the SUM of
 * every tier it matched (see FIELD_TIER). Nothing in the constants stops a stack
 * of low tiers — introducer + description + phrase + transcript + speaker name —
 * from reaching a single name tier. What keeps title matches on top is a
 * property of the corpus: a subject's title terms recur in its description and
 * its debate, so a title match's clause set is in practice a superset of a
 * stacked non-title match's. That is an empirical claim about the index, and it
 * can stop being true, so this measures it instead of trusting it.
 *
 * Two separate questions, measured on two runs of the same query:
 *   - Is the ordering broken NOW? Measured with the ranking multiplier active,
 *     because that is the order users see. Any title match scoring below any
 *     non-title match is a FAIL.
 *   - Could it break from metadata alone? Measured with the multiplier AND the
 *     semantic arm stripped, so the ratio is a property of the tiers only (a
 *     semantic-only hit carries no matched_queries, so leaving that arm on put
 *     the semantic mapping constants in the denominator). A ratio above
 *     MAX_RANKING_MULTIPLIER_RATIO means no assignment of administrative body,
 *     discussion length and date can invert the pair — the tiers hold
 *     structurally. Below it, the pair is inside the multiplier's reach and only
 *     the current metadata is keeping it in order: a WARN, not a failure.
 *
 * The queries are the surname/topic stem collisions FIELD_TIER worries about,
 * where a person name and a common word share a stem, plus plain topic queries
 * as a control.
 *
 * Half of them have to be MULTI-TERM, and those are the half that matter. A
 * one-word query collapses LEXICAL_MINIMUM_SHOULD_MATCH ('2<75%') to "one
 * term", so both halves of every coverage pair fire together and a partial
 * match cannot be told from a full one. The case this check exists to catch — a
 * document that covers ONE term of the query in its title and stacks the lower
 * tiers underneath — only exists from two terms up, and it is common there,
 * because the greek stemmer does not always map an inflection to the stem the
 * query produces (σχολικές -> σχολικ, but Σχολικών -> σχολ). Measured Aug 2026:
 * the one-word queries below report 1.50-2.57, the multi-term ones 1.11-1.86.
 *
 * A person-plus-topic query cannot be measured here, whatever it exposes
 * elsewhere: no subject carries both a person name and a topic word in its
 * title, so the check finds no title match and skips.
 */
const TIER_MARGIN_QUERIES = [
    'Δήμος', 'Γεωργίου', 'Οικονόμου', 'Χρήστου', 'Παπαδόπουλος', 'Αθηνά',
    'Δούκας', 'Νικολάου', 'Βασιλείου', 'Μακρής', 'πρόεδρος', 'αντιδήμαρχος',
    'ανακύκλωση', 'προϋπολογισμός', 'καθαριότητα', 'δάνειο', 'φωτισμός', 'πάρκα',
    'ηλεκτρικά πατίνια', 'άδεια μουσικής', 'πάρκα Κυψέλης', 'παιδικοί σταθμοί',
    'χώροι πρασίνου', 'ανάπλαση πλατείας', 'αδέσποτα ζώα', 'σχολικές επιτροπές',
    'διαχείριση απορριμμάτων', 'κοινόχρηστοι χώροι', 'τεχνικό πρόγραμμα',
];

// Which tier each scoring clause belongs to, recovered from the clause shape.
// Used only to tell name clauses from the rest, but the full label makes the
// printed failures readable.
function tierLabel(inner: estypes.QueryDslQueryContainer): string {
    if (inner.match) {
        const field = Object.keys(inner.match)[0];
        const match = inner.match[field];
        if (field === 'name') {
            return typeof match === 'object' && match !== null && 'fuzziness' in match
                ? 'fuzzyName'
                : 'nameTerm';
        }
        if (field === 'description') return 'descriptionTerm';
        if (field === 'introduced_by_person_name') return 'introducer';
        if (field === 'location_text') return 'locationText';
        if (field.endsWith('.text')) return 'transcript';
        if (field.endsWith('speaker_person_name')) return 'speakerName';
        return field;
    }
    if (inner.match_phrase) {
        return Object.keys(inner.match_phrase)[0] === 'name' ? 'namePhrase' : 'descriptionPhrase';
    }
    if (inner.nested?.query) return tierLabel(inner.nested.query);
    // A field's alternate spellings share one dis_max and therefore one tier
    // (see anySpelling), so the first branch names the whole clause.
    if (inner.dis_max?.queries.length) return tierLabel(inner.dis_max.queries[0]);
    return 'unknown';
}

// `_name` is a query-level annotation Elasticsearch echoes back in
// matched_queries. estypes models it on the leaf option objects but not on every
// container, so stamping needs a narrow index signature rather than the whole
// clause typed loose.
type Nameable = { _name?: string };

// The minimum_should_match a clause asks for, read through the dis_max over
// spellings and the nested wrapper. It is what tells the two halves of a
// coverage pair apart: the strict half takes LEXICAL_MINIMUM_SHOULD_MATCH, the
// partial half takes 1.
function coverageOf(inner: estypes.QueryDslQueryContainer): string | number | undefined {
    if (inner.dis_max?.queries.length) return coverageOf(inner.dis_max.queries[0]);
    if (inner.nested?.query) return coverageOf(inner.nested.query);
    const options = Object.values(inner.match ?? {})[0];
    return typeof options === 'object' && options !== null
        ? options.minimum_should_match
        : undefined;
}

// Tags every scoring clause with _name so matched_queries reports which tiers
// fired on each hit. Each field emits a strict/partial coverage pair, and the
// two mean different things to this check, so the partial half is labelled as
// such rather than counted off as a repeat: a `#2` suffix reads as "the same
// tier again", which is how a partial name match came to be scored as a title
// match below.
function stampTierNames(query: estypes.QueryDslQueryContainer | undefined): void {
    const should = (lexicalBoolOf(query)?.should ?? []) as estypes.QueryDslQueryContainer[];
    if (!should.length) throw new Error('lexical should-clauses missing');

    const counts: Record<string, number> = {};
    for (const clause of should) {
        const functionScore = clause.function_score;
        const inner = functionScore && !Array.isArray(functionScore) ? functionScore.query : undefined;
        if (!inner) continue;
        const base = coverageOf(inner) === 1 ? `${tierLabel(inner)}#partial` : tierLabel(inner);
        counts[base] = (counts[base] ?? 0) + 1;
        stampClause(inner, counts[base] > 1 ? `${base}#${counts[base]}` : base);
    }
}

// One clause may be a dis_max over spellings, so every branch takes the same
// name — matched_queries reports the tier, whichever spelling matched.
function stampClause(inner: estypes.QueryDslQueryContainer, name: string): void {
    if (inner.dis_max) {
        for (const branch of inner.dis_max.queries) stampClause(branch, name);
        return;
    }
    if (inner.nested) {
        (inner.nested as Nameable)._name = name;
        return;
    }
    const leaf = inner.match ?? inner.match_phrase;
    if (!leaf) return;
    const options = Object.values(leaf)[0];
    if (typeof options === 'object' && options !== null) (options as Nameable)._name = name;
}

interface TierHit { score: number; name: string; tiers: string[]; title: boolean }

/**
 * The two runs the check compares.
 *
 * `live` is the production query exactly as a user gets it: the semantic arm is
 * on and the multiplier applies, because that is the order that can be wrong
 * right now.
 *
 * `bare` must hold nothing but the field tiers, so it strips BOTH. The
 * multiplier comes off by lifting the query it wraps, and the semantic arm comes
 * off at build time: a semantic-only hit carries no matched_queries, so it is
 * labelled non-title and lands in the ratio's denominator, where it measures
 * SEMANTIC_MAPPED_BASE and SEMANTIC_MAPPED_SCALE instead of the tiers this run
 * exists to measure.
 */
type TierRun = 'live' | 'bare';

async function runTierQuery(queryText: string, run: TierRun): Promise<TierHit[]> {
    const q = buildSearchQuery(
        { query: queryText, config: { size: 100, enableSemanticSearch: run === 'live' } },
        NO_EXTRACTED_FILTERS
    );
    stampTierNames(q.query);
    const query = run === 'live' ? q.query : rankedQueryOf(q.query);

    const res = await client.search<EvalSource>({
        index: q.index,
        query,
        size: 100,
        track_total_hits: true,
        _source: ['name'],
    });
    return res.hits.hits.map((h) => {
        const tiers = h.matched_queries ?? [];
        const names = Array.isArray(tiers) ? tiers : Object.keys(tiers);
        return {
            score: h._score ?? 0,
            name: (h._source?.name ?? '(no name)').slice(0, 64),
            tiers: names,
            // A title match is a document whose TITLE covers the query — the
            // strict half of the name clause, or the name phrase. The partial
            // half fires on a single matching term (minimum_should_match 1), so
            // counting it here labelled a one-word-of-three match a title match:
            // it then stood as `worstTitle` against a legitimate non-title
            // stack and printed an inversion for correct behaviour, while the
            // real inversion — a partial name match ON TOP of that stack —
            // could never reach the non-title side to be seen.
            title: names.some((t) => t === 'nameTerm' || t === 'namePhrase'),
        };
    });
}

/**
 * The real multiplier ceiling for the index as it stands right now.
 *
 * MAX_RANKING_MULTIPLIER_RATIO is computed from LONGEST_DISCUSSION_MINUTES, a
 * measurement taken once against a smaller index. The longest discussion only
 * grows, so trusting the constant would let this check print "structurally safe"
 * for pairs the multiplier can in fact invert. Measuring the maximum here costs
 * one aggregation and keeps the guard honest; the constant stays as the offline
 * default and this reports when it has drifted.
 */
async function measureMultiplierCeiling(index: string | undefined): Promise<number> {
    const res = await client.search<EvalSource>({
        index,
        size: 0,
        query: { term: { 'meeting_released': true } },
        aggs: { longest: { max: { field: 'discussion_speaking_seconds' } } },
    });
    const longest = res.aggregations?.longest;
    const seconds = longest && 'value' in longest ? longest.value ?? 0 : 0;
    return rankingMultiplierRatio(seconds / 60);
}

async function runTierMargin(): Promise<void> {
    const index = process.env.ELASTICSEARCH_INDEX;
    const ceiling = await measureMultiplierCeiling(index);
    console.log(
        `\nTier-margin check — a pre-multiplier ratio above ` +
        `${ceiling.toFixed(3)} means\n` +
        `the tiers hold on their own; below it, only the current metadata keeps the pair in order.`
    );
    if (ceiling > MAX_RANKING_MULTIPLIER_RATIO + 0.001) {
        console.log(
            `  ! measured against the live index; MAX_RANKING_MULTIPLIER_RATIO says ` +
            `${MAX_RANKING_MULTIPLIER_RATIO.toFixed(3)}.\n` +
            `    Update LONGEST_DISCUSSION_MINUTES in src/lib/search/query.ts — the unit tests read the constant.`
        );
    }
    console.log('');

    let failed = 0, warned = 0, skipped = 0;
    for (const queryText of TIER_MARGIN_QUERIES) {
        const [live, bare] = await Promise.all([
            runTierQuery(queryText, 'live'),
            runTierQuery(queryText, 'bare'),
        ]);

        const split = (hits: TierHit[]) => ({
            titles: hits.filter((h) => h.title),
            others: hits.filter((h) => !h.title),
        });
        const liveSplit = split(live);
        const bareSplit = split(bare);
        if (!liveSplit.titles.length || !liveSplit.others.length ||
            !bareSplit.titles.length || !bareSplit.others.length) {
            skipped++;
            const why = !liveSplit.titles.length ? 'no title match' : 'no non-title hit';
            console.log(`  ·    "${queryText}" — skipped (${why} in top 100)`);
            continue;
        }

        // The invariant: every title match outranks every non-title match.
        const worstTitle = liveSplit.titles.reduce((a, b) => (a.score <= b.score ? a : b));
        const bestOther = liveSplit.others.reduce((a, b) => (a.score >= b.score ? a : b));
        const bareRatio =
            Math.min(...bareSplit.titles.map((h) => h.score)) /
            Math.max(...bareSplit.others.map((h) => h.score));

        if (worstTitle.score <= bestOther.score) {
            failed++;
            console.log(`  ✗    "${queryText}" — a non-title hit outranks a title match`);
            console.log(`          title     ${worstTitle.score.toFixed(1).padStart(7)} [${worstTitle.tiers.join(',')}] ${worstTitle.name}`);
            console.log(`          non-title ${bestOther.score.toFixed(1).padStart(7)} [${bestOther.tiers.join(',')}] ${bestOther.name}`);
        } else if (bareRatio < ceiling) {
            warned++;
            console.log(
                `  !    "${queryText}" — holds, but inside the multiplier's reach ` +
                `(tier ratio ${bareRatio.toFixed(2)}); best non-title: ${bestOther.name}`
            );
        } else {
            console.log(`  ✓    "${queryText}" — tier ratio ${bareRatio.toFixed(2)}`);
        }
    }

    const checked = TIER_MARGIN_QUERIES.length - skipped;
    console.log(
        `\n═══ tier margin: ${checked - failed - warned}/${checked} structurally safe, ` +
        `${warned} inside multiplier reach, ${failed} inverted` +
        (skipped ? ` (${skipped} skipped)` : '')
    );
    if (failed) process.exitCode = 1;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--tier-margin')) {
        await runTierMargin();
        return;
    }
    const flagValue = (flag: string): string | undefined => {
        const i = args.indexOf(flag);
        return i >= 0 ? args[i + 1] : undefined;
    };

    const mode = (flagValue('--mode') ?? 'full') as 'full' | 'lexical' | 'semantic';
    // Sweeps DEFAULT_SEMANTIC_MIN_SCORE without editing query.ts: run the suite
    // at several cutoffs and read where the on-topic and paraphrase cases start
    // to go empty and the junk ones stop. That sweep is what produced 0.930.
    const rawMinScore = flagValue('--min-score');
    const semanticMinScore = rawMinScore === undefined ? undefined : Number(rawMinScore);
    if (semanticMinScore !== undefined && !Number.isFinite(semanticMinScore)) {
        throw new Error(`--min-score expects a number, got "${rawMinScore}"`);
    }
    const query = flagValue('--query');

    if (query !== undefined) {
        const { total, rows } = await runQuery(query, mode, semanticMinScore);
        console.log(`\n▶ "${query}" [${mode}] — total=${total}`);
        printRows(rows);
        return;
    }

    let pass = 0;
    const failures: string[] = [];
    for (const c of CASES) {
        const { total, rows } = await runQuery(c.query, mode, semanticMinScore);
        const ok = c.expect === 'empty' ? total === 0 : total > 0;
        if (ok) pass++; else failures.push(c.query);
        const flag = ok ? '✓' : '✗';
        console.log(`\n${flag} "${c.query}" (${c.note}) [expect ${c.expect}] — total=${total}`);
        printRows(rows.slice(0, c.expect === 'empty' ? 5 : 8));
    }
    console.log(`\n═══ ${pass}/${CASES.length} expectations met (mode=${mode}` +
        `${semanticMinScore === undefined ? '' : `, min-score=${semanticMinScore}`})` +
        (failures.length ? ` — failing: ${failures.map(f => `"${f}"`).join(', ')}` : ''));
    // A missed expectation is a failure, not a note in the log. Without this the
    // suite printed its ✗ marks and still exited 0, so nothing that reads an
    // exit status could tell a clean run from a broken one. runTierMargin does
    // the same at the end of its own summary.
    if (failures.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
