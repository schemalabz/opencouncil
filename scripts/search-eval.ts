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
 */
import { config } from 'dotenv';
config();
process.env.ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX || 'subjects';

import { Client } from '@elastic/elasticsearch';
import { buildSearchQuery } from '../src/lib/search/query';
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

    // Semantic-only mode: drop the lexical retriever, keep the semantic one.
    if (mode === 'semantic' && q.retriever && 'rrf' in q.retriever) {
        const rrf: any = (q.retriever as any).rrf;
        if (rrf.retrievers.length < 2) throw new Error('semantic retriever missing');
        q.retriever = rrf.retrievers[1];
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
            `   ${String(i + 1).padStart(2)}. [${r.matched.padEnd(3)}] ${r.date} ${r.body.padEnd(9)} ` +
            `${String(r.minutes).padStart(3)}m ${r.city.padEnd(10).slice(0, 10)} ${r.name}`
        );
    }
}

async function main() {
    const args = process.argv.slice(2);
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
