/**
 * Search ranking eval harness. Runs a labeled query set against the live
 * Elasticsearch index through buildSearchQuery (the exact production query
 * builder) and prints ranked results for manual + automatic judgment.
 *
 * Read-only: only _search calls. AI filter extraction is deliberately
 * bypassed (NO_EXTRACTED_FILTERS) — this evaluates ES ranking in isolation.
 *
 * Usage:
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts                 # full suite
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --mode lexical  # lexical arm only
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --query "..."   # one ad-hoc query
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --tier-margin   # field-tier ordering
 */
import { config } from 'dotenv';
config();
process.env.ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX || 'subjects';

import { Client, estypes } from '@elastic/elasticsearch';
import { buildSearchQuery, MAX_RANKING_MULTIPLIER_RATIO } from '../src/lib/search/query';
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
    matched: string; // N=name D=description T=transcript
}

const client = new Client({
    node: process.env.ELASTICSEARCH_URL!,
    auth: { apiKey: process.env.ELASTICSEARCH_API_KEY! },
});

function markMatched(hit: any): string {
    const hl = hit.highlight || {};
    let m = '';
    if (hl['name']) m += 'N';
    if (hl['description']) m += 'D';
    const inner = hit.inner_hits?.speaker_contributions?.hits?.total?.value;
    if (inner) m += 'T';
    return m || '·';
}

async function runQuery(
    queryText: string,
    mode: 'full' | 'lexical' | 'semantic',
    size = 10
): Promise<{ total: number; rows: HitRow[] }> {
    const request: SearchRequest = {
        query: queryText,
        config: {
            size,
            enableSemanticSearch: mode !== 'lexical',
        },
    };
    const q = buildSearchQuery(request, NO_EXTRACTED_FILTERS);

    // Semantic-only mode: the semantic side is the second branch of the dis_max
    // under `must` (see buildSemanticFallbackQuery). Keep only that branch so
    // its mapped scores and survivors are visible in isolation.
    if (mode === 'semantic') {
        const ranking = q.query?.function_score;
        // function_score's container type also allows a bare function array;
        // buildSearchQuery always emits the full query form.
        const bool = ranking && !Array.isArray(ranking) ? ranking.query?.bool : undefined;
        const must = (bool?.must ?? []) as estypes.QueryDslQueryContainer[];
        const disMax = must.find((c) => c.dis_max)?.dis_max;
        const semantic = disMax?.queries.find((c) => c.function_score);
        if (!disMax || !semantic) throw new Error('semantic fallback branch missing');
        disMax.queries = [semantic];
    }

    const body: any = {
        ...q,
        _source: [
            'id', 'name', 'city_name', 'administrative_body_type',
            'meeting_date', 'discussion_speaking_seconds',
        ],
        highlight: {
            fields: { name: {}, description: {} },
            pre_tags: ['«'], post_tags: ['»'],
        },
    };
    delete body.index;

    const res: any = await client.search({ index: process.env.ELASTICSEARCH_INDEX!, ...body });
    const rows: HitRow[] = res.hits.hits.map((h: any) => ({
        score: h._score ?? 0,
        name: (h._source?.name ?? '(no name)').slice(0, 78),
        city: h._source?.city_name ?? '?',
        body: h._source?.administrative_body_type ?? '—',
        date: (h._source?.meeting_date ?? '').slice(0, 10),
        minutes: Math.round((h._source?.discussion_speaking_seconds ?? 0) / 60),
        matched: markMatched(h),
    }));
    return { total: res.hits.total.value, rows };
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
 *   - Could it break from metadata alone? Measured with the multiplier stripped,
 *     so the ratio is a property of the tiers only. A pre-multiplier ratio above
 *     MAX_RANKING_MULTIPLIER_RATIO means no assignment of administrative body,
 *     discussion length and date can invert the pair — the tiers hold
 *     structurally. Below it, the pair is inside the multiplier's reach and only
 *     the current metadata is keeping it in order: a WARN, not a failure.
 *
 * The queries are the surname/topic stem collisions FIELD_TIER worries about,
 * where a person name and a common word share a stem, plus plain topic queries
 * as a control.
 */
const TIER_MARGIN_QUERIES = [
    'Δήμος', 'Γεωργίου', 'Οικονόμου', 'Χρήστου', 'Παπαδόπουλος', 'Αθηνά',
    'Δούκας', 'Νικολάου', 'Βασιλείου', 'Μακρής', 'πρόεδρος', 'αντιδήμαρχος',
    'ανακύκλωση', 'προϋπολογισμός', 'καθαριότητα', 'δάνειο', 'φωτισμός', 'πάρκα',
];

// Which tier each scoring clause belongs to, recovered from the clause shape.
// Used only to tell name clauses from the rest, but the full label makes the
// printed failures readable.
function tierLabel(inner: any): string {
    if (inner.match) {
        const field = Object.keys(inner.match)[0];
        if (field === 'name') return inner.match[field].fuzziness ? 'fuzzyName' : 'nameTerm';
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
    if (inner.nested) return tierLabel(inner.nested.query);
    return 'unknown';
}

// Tags every scoring clause with _name so matched_queries reports which tiers
// fired on each hit. Each field emits more than one clause (a strict/partial
// coverage pair, plus one per alternate spelling), so repeats get a #N suffix.
function stampTierNames(query: estypes.SearchRequest['query']): void {
    const ranking = (query as any)?.function_score;
    const disMax = (ranking?.query?.bool?.must ?? []).find((c: any) => c.dis_max)?.dis_max;
    const should = disMax?.queries?.[0]?.bool?.should;
    if (!should) throw new Error('lexical should-clauses missing');

    const counts: Record<string, number> = {};
    for (const clause of should) {
        const inner = clause.function_score?.query;
        if (!inner) continue;
        const base = tierLabel(inner);
        counts[base] = (counts[base] ?? 0) + 1;
        const name = counts[base] > 1 ? `${base}#${counts[base]}` : base;
        if (inner.nested) { inner.nested._name = name; continue; }
        const kind = inner.match ? 'match' : inner.match_phrase ? 'match_phrase' : null;
        if (!kind) continue;
        const field = Object.keys(inner[kind])[0];
        if (typeof inner[kind][field] === 'object') inner[kind][field]._name = name;
    }
}

interface TierHit { score: number; name: string; tiers: string[]; title: boolean }

async function runTierQuery(queryText: string, withRanking: boolean): Promise<TierHit[]> {
    const q = buildSearchQuery(
        { query: queryText, config: { size: 100, enableSemanticSearch: true } },
        NO_EXTRACTED_FILTERS
    );
    stampTierNames(q.query);
    // Drop the post-relevance multiplier by lifting the query it wraps, leaving
    // the field tiers as the only thing scoring.
    const query = withRanking ? q.query : (q.query as any).function_score.query;

    const res: any = await client.search({
        index: process.env.ELASTICSEARCH_INDEX!,
        query,
        size: 100,
        track_total_hits: true,
        _source: ['name'],
    });
    return res.hits.hits.map((h: any) => {
        const tiers: string[] = h.matched_queries ?? [];
        return {
            score: h._score ?? 0,
            name: (h._source?.name ?? '(no name)').slice(0, 64),
            tiers,
            title: tiers.some((t) => t.startsWith('nameTerm') || t.startsWith('namePhrase')),
        };
    });
}

async function runTierMargin(): Promise<void> {
    console.log(
        `\nTier-margin check — a pre-multiplier ratio above ` +
        `${MAX_RANKING_MULTIPLIER_RATIO.toFixed(3)} (MAX_RANKING_MULTIPLIER_RATIO) means\n` +
        `the tiers hold on their own; below it, only the current metadata keeps the pair in order.\n`
    );

    let failed = 0, warned = 0, skipped = 0;
    for (const queryText of TIER_MARGIN_QUERIES) {
        const [live, bare] = await Promise.all([
            runTierQuery(queryText, true),
            runTierQuery(queryText, false),
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
        } else if (bareRatio < MAX_RANKING_MULTIPLIER_RATIO) {
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
    const modeIdx = args.indexOf('--mode');
    const mode = (modeIdx >= 0 ? args[modeIdx + 1] : 'full') as 'full' | 'lexical' | 'semantic';
    const queryIdx = args.indexOf('--query');

    if (queryIdx >= 0) {
        const q = args[queryIdx + 1];
        const { total, rows } = await runQuery(q, mode);
        console.log(`\n▶ "${q}" [${mode}] — total=${total}`);
        printRows(rows);
        return;
    }

    let pass = 0, fail = 0;
    const failures: string[] = [];
    for (const c of CASES) {
        const { total, rows } = await runQuery(c.query, mode);
        const ok = c.expect === 'empty' ? total === 0 : total > 0;
        if (ok) pass++; else { fail++; failures.push(c.query); }
        const flag = ok ? '✓' : '✗';
        console.log(`\n${flag} "${c.query}" (${c.note}) [expect ${c.expect}] — total=${total}`);
        printRows(rows.slice(0, c.expect === 'empty' ? 5 : 8));
    }
    console.log(`\n═══ ${pass}/${CASES.length} expectations met (mode=${mode})` +
        (failures.length ? ` — failing: ${failures.map(f => `"${f}"`).join(', ')}` : ''));
}

main().catch(e => { console.error(e); process.exit(1); });
