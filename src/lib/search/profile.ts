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
 *     SKIP_ENV_VALIDATION=1 ELASTICSEARCH_INDEX=<copy> npx tsx scripts/search-eval.ts --min-score <x>
 *
 * `.jina-embeddings-v3` (Elastic Inference Service), measured Oct 2026 on
 * 14,033 subjects with the eval suite plus 20 extra junk queries and 15 extra
 * paraphrases:
 *   - on-topic best hit:    0.653 - 0.821 (median 0.739)
 *   - off-topic best hit:   0.553 - 0.694 (32 queries; the ceiling is
 *     "ηλιοβασίλεμα Σαντορίνη" against `Προνομιακή θέση νησιού`)
 *   - paraphrase floor:     0.702 ("παιδικοί σταθ"), 0.705 ("ζώα χωρίς
 *     ιδιοκτήτη")
 *   A cutoff of 0.70 admits no junk query and empties three queries that the
 *   lexical arm serves ("Μαλτέζος", "Χάρης Δούκας", "υπολογιστές"); 0.71
 *   starts to empty paraphrases. The band from 0.70 to the ~0.825 ceiling is
 *   ~0.125 wide, so 8 / 0.125 gives the scale of 64. Related subjects: specific
 *   titles find their neighbours at 0.75-0.85, and the drift into unrelated
 *   subjects begins just under 0.70 (a question-time subject pulls `Πρόστιμα
 *   επιγραφών` at 0.693). Generic policy titles drift higher and no floor
 *   separates those without emptying every specific title.
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
 * The windows are thin on both models, ~0.002 to ~0.006 a side, because the
 * nearest neighbour of a junk query is arbitrary and moves as the index grows.
 */
const PROFILES: Record<string, ScoreProfile> = {
    '.jina-embeddings-v3': { semanticMinScore: 0.70, semanticMappedScale: 64, relatedMinSimilarity: 0.71 },
    'opencouncil-multilingual-e5-small-elasticsearch': { semanticMinScore: 0.934, semanticMappedScale: 320, relatedMinSimilarity: 0.93 },
};

/** The endpoint `elasticsearch/schema.json` names for the semantic fields. */
export const SCHEMA_INFERENCE_ID = '.jina-embeddings-v3';

/** The profile of the schema's endpoint: what a build of the app assumes. */
export const DEFAULT_SCORE_PROFILE: ScoreProfile = PROFILES[SCHEMA_INFERENCE_ID];

/** How long a resolved profile is trusted before the alias is read again. */
const PROFILE_TTL_MS = 5 * 60 * 1000;

let resolved: { at: number; value: IndexProfile } | null = null;
let warnedUnknown: string | null = null;

function inferenceIdOf(mappings: estypes.MappingTypeMapping | undefined): string | null {
    const name = mappings?.properties?.name;
    const semantic = name && 'fields' in name ? name.fields?.semantic : undefined;
    return semantic?.type === 'semantic_text' ? semantic.inference_id ?? null : null;
}

/**
 * The thresholds for the index the alias serves right now.
 *
 * A model change is an index rebuild behind the `subjects` alias, and the
 * alias moves without a deploy. Reading the endpoint off the live mapping ties
 * the thresholds to the index instead of to the build, so a deploy before the
 * swap keeps serving the old model's thresholds, and a swap before the deploy
 * picks up the new ones. The concrete index name goes into cache keys for the
 * same reason: a key built from the alias would survive the swap.
 *
 * The lookup is one request per process per five minutes. When it fails, the
 * schema's profile applies under the alias name, and the next call retries.
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
        console.warn(`[Search] could not read the mapping of ${alias}; using the schema's score profile`, error);
        return { index: alias, inferenceId: null, ...DEFAULT_SCORE_PROFILE };
    }
}

/** Forgets the resolved profile. For tests. */
export function resetIndexProfileCache(): void {
    resolved = null;
    warnedUnknown = null;
}
