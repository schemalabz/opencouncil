import type { Client, estypes } from '@elastic/elasticsearch';
import { env } from '@/env.mjs';

/** The score thresholds that fit one embedding model. */
export interface ScoreProfile {
    /**
     * Similarity cutoff (normalized cosine, 0-1) for the search's semantic
     * fallback. The gate is the best of the two sub-field similarities (see
     * buildSemanticFallbackQuery in ./query.ts), so the value means "the
     * closest thing this document has to say scores at least this well".
     */
    semanticMinScore: number;
    /**
     * Points of BM25 space per unit of similarity above the cutoff (see
     * SEMANTIC_MAPPED_BASE in ./query.ts). Sized so the model's useful band,
     * cutoff to observed ceiling, spreads over ~8 points.
     */
    semanticMappedScale: number;
    /** Similarity floor for a related subject (see ./related.ts). */
    relatedMinSimilarity: number;
}

/**
 * What a query builder takes: the thresholds, and the concrete index to search
 * when one was resolved. Without an index the builder searches the alias.
 */
export type QueryProfile = ScoreProfile & { index?: string };

/** A score profile plus the index it was resolved for. */
export interface IndexProfile extends ScoreProfile {
    /** The concrete index behind the alias, or the alias when unresolved. */
    index: string;
    /** The inference endpoint of the semantic fields, or null when unresolved. */
    inferenceId: string | null;
}

/**
 * The thresholds per inference endpoint, keyed by the `inference_id` of the
 * `semantic_text` fields. A new model gets a new entry, measured with
 * `scripts/search-eval.ts` on a full copy of the index:
 *
 *     ELASTICSEARCH_INDEX=<copy> npx tsx scripts/search-eval.ts --bands
 *     ELASTICSEARCH_INDEX=<copy> npx tsx scripts/search-eval.ts --min-score <x>
 *
 * `--bands` prints the best similarity per case, grouped into junk, paraphrase
 * and on-topic; the cutoff goes where it admits no junk and loses the fewest
 * paraphrases, and the scale is 8 divided by the band from the cutoff to the
 * on-topic ceiling. The related floor comes from `--related` on ten specific
 * titles: just above the score where unrelated subjects start to appear.
 *
 * `.jina-embeddings-v5-text-small` (Elastic Inference Service), measured Oct
 * 2026 on 14,888 subjects with the 90 cases of the suite:
 *   - junk best hit:        0.611 - 0.775 (median 0.700; the ceiling is
 *     "οδηγίες πλυντηρίου" against `Πλύση κάδων απορριμμάτων`, which is
 *     a real neighbour of a junk query)
 *   - paraphrase best hit:  0.759 - 0.888 (median 0.831; the floor is
 *     "συλλογή ογκωδών αντικειμένων", which has no matching subject)
 *   - on-topic best hit:    0.692 - 0.902 (median 0.821)
 *   0.78 admits no junk query and loses one paraphrase, the one with no
 *   subject. Any cutoff from 0.759 to 0.789 costs at most one more miss, a
 *   tolerance of 24% of the band; the scale is 8 / (0.902 - 0.78) = 66.
 *   Typos clear the cutoff ("ανακίκλωση" 0.819), which only the semantic
 *   arm can serve; surnames and declensions fall under it and the lexical
 *   arm serves those. Related: specific titles find their neighbours at
 *   0.81-0.96, and unrelated subjects appear from 0.734 ("Μετακίνηση
 *   Γιαννακάκη" pulls a street redesign); generic procedural titles pull
 *   other extensions and resolutions from 0.78, which no floor separates
 *   without emptying the specific titles.
 *
 *   Compared on the same cases and corpus: `.jina-embeddings-v3` gave a
 *   tolerance of 20% of its band, lost the typo "ανακίκλωση" (0.653 against
 *   a cutoff of 0.70), missed the Γιαννακάκη neighbour, and answered a
 *   semantic query in 155 ms against 42 ms. `.jina-embeddings-v5-text-nano`
 *   gave 25% but lost two typos ("ανακίκλωση", "διαγρραφή τελών").
 *
 * `.jina-embeddings-v3` stays as the profile of the index this branch first
 * measured (cutoff 0.70, scale 64, related floor 0.71 on 14,033 subjects), so
 * an index built with it keeps its thresholds until the alias moves.
 *
 * `opencouncil-multilingual-e5-small-elasticsearch` (in-project e5 model, in
 * use until Oct 2026), re-measured Aug 2026 on 9,181 released subjects:
 *   - on-topic best hit:    0.9399 - 0.9546
 *   - paraphrase best hit:  0.9314 - 0.9499, floor in [0.936, 0.940)
 *   - off-topic best hit:   0.8968 - 0.9319 (a keyboard mash against
 *     `Μεταστέγαση ΕΝΕΓΙΛ`)
 *   0.934 sits ~0.002 from each side. The band to the 0.955 ceiling is ~0.025
 *   wide, hence the scale of 320. Related: neighbours at 0.936-0.954, drift
 *   from 0.919, floor 0.93. The e5 numbers stay here so the resolver can serve
 *   the old index until the alias moves (see resolveIndexProfile).
 *
 * The windows are thin on every model, a few thousandths a side, because the
 * nearest neighbour of a junk query is arbitrary and moves as the index grows.
 */
const PROFILES: Record<string, ScoreProfile> = {
    '.jina-embeddings-v5-text-small': { semanticMinScore: 0.78, semanticMappedScale: 66, relatedMinSimilarity: 0.75 },
    '.jina-embeddings-v3': { semanticMinScore: 0.70, semanticMappedScale: 64, relatedMinSimilarity: 0.71 },
    'opencouncil-multilingual-e5-small-elasticsearch': { semanticMinScore: 0.934, semanticMappedScale: 320, relatedMinSimilarity: 0.93 },
};

/** The endpoint `elasticsearch/schema.json` names for the semantic fields. */
export const SCHEMA_INFERENCE_ID = '.jina-embeddings-v5-text-small';

/** The profile of the schema's endpoint: what a build of the app assumes. */
export const DEFAULT_SCORE_PROFILE: ScoreProfile = PROFILES[SCHEMA_INFERENCE_ID];

/** How long a resolved profile is trusted before the alias is read again. */
const PROFILE_TTL_MS = 5 * 60 * 1000;

/** How long a failed refresh keeps the last known profile before the next try. */
const RETRY_AFTER_FAILURE_MS = 30 * 1000;

let resolved: { at: number; value: IndexProfile } | null = null;
let warnedUnknown: string | null = null;

function inferenceIdOf(mappings: estypes.MappingTypeMapping | undefined): string | null {
    const name = mappings?.properties?.name;
    const semantic = name && 'fields' in name ? name.fields?.semantic : undefined;
    return semantic?.type === 'semantic_text' ? semantic.inference_id ?? null : null;
}

/**
 * The thresholds for the index the alias serves right now, and that index.
 *
 * A model change is an index rebuild behind the `subjects` alias, and the
 * alias moves without a deploy. Reading the endpoint off the live mapping ties
 * the thresholds to the index instead of to the build, so a deploy before the
 * swap keeps serving the old model's thresholds, and a swap before the deploy
 * picks up the new ones. The queries then name the concrete index, not the
 * alias, so a swap inside the five-minute window cannot pair one index's
 * thresholds with the other's scores; the old index stays searchable until
 * the next refresh, which is why it must outlive the swap by at least that
 * long. The concrete index name goes into cache keys for the same reason: a
 * key built from the alias would survive the swap.
 *
 * The lookup is one request per process per five minutes. When a refresh
 * fails, the last known profile stays in force and the next try waits thirty
 * seconds: the mapping of an index does not change, so a known answer beats a
 * guess. Only a process that has never resolved anything falls back to the
 * schema's profile under the alias name, which is what the build assumes.
 */
export async function resolveIndexProfile(client: Client): Promise<IndexProfile> {
    if (resolved && Date.now() - resolved.at < PROFILE_TTL_MS) return resolved.value;
    const alias = env.ELASTICSEARCH_INDEX;
    try {
        const response = await client.indices.getMapping({ index: alias });
        const [index, body] = Object.entries(response)[0] ?? [];
        if (!index) throw new Error(`no index behind ${alias}`);
        const inferenceId = inferenceIdOf(body?.mappings);
        const profile = inferenceId ? PROFILES[inferenceId] : undefined;
        if (!profile && warnedUnknown !== index) {
            warnedUnknown = index;
            console.warn(`[Search] ${index} embeds with ${inferenceId ?? 'no endpoint'}, which has no score profile; using the schema's`);
        }
        resolved = { at: Date.now(), value: { index, inferenceId, ...(profile ?? DEFAULT_SCORE_PROFILE) } };
        return resolved.value;
    } catch (error) {
        if (resolved) {
            console.warn(`[Search] could not refresh the mapping of ${alias}; keeping the profile of ${resolved.value.index}`, error);
            resolved = { at: Date.now() - PROFILE_TTL_MS + RETRY_AFTER_FAILURE_MS, value: resolved.value };
            return resolved.value;
        }
        console.warn(`[Search] could not read the mapping of ${alias}; using the schema's score profile`, error);
        return { index: alias, inferenceId: null, ...DEFAULT_SCORE_PROFILE };
    }
}

/** Forgets the resolved profile: the next call reads the alias again. */
export function resetIndexProfileCache(): void {
    resolved = null;
    warnedUnknown = null;
}

/** Whether Elasticsearch answered that the index of the request does not exist. */
export function isIndexNotFound(error: unknown): boolean {
    const type = (error as { meta?: { body?: { error?: { type?: string } } } } | null)?.meta?.body?.error?.type;
    return type === 'index_not_found_exception';
}

/**
 * Runs an index operation under the resolved profile, and once more under a
 * fresh one when the index the profile named is gone.
 *
 * The profile names a concrete index. After an alias swap that index stays
 * searchable until it is deleted, and the resolver re-reads the alias every
 * five minutes, so the two normally never meet. When a refresh keeps failing,
 * or the old index is deleted early, a request can still reach a deleted
 * index. Elasticsearch answers index_not_found; the stale profile is dropped
 * and the operation runs again under whatever the alias serves now.
 */
export async function withIndexProfile<T>(client: Client, run: (profile: IndexProfile) => Promise<T>): Promise<T> {
    try {
        return await run(await resolveIndexProfile(client));
    } catch (error) {
        if (!isIndexNotFound(error)) throw error;
        resetIndexProfileCache();
        return run(await resolveIndexProfile(client));
    }
}
