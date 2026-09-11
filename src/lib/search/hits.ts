import { sendErrorAdminAlert } from '@/lib/discord-core';
import { env } from '@/env.mjs';

interface EsInnerHit {
    _source?: { segment_id?: string };
}

export interface EsHit {
    _score?: number | null;
    _source?: { id?: string };
    inner_hits?: Record<string, { hits?: { hits?: EsInnerHit[] } }>;
    /** ES highlight fragments, keyed by field name (e.g. `name`, `description`). */
    highlight?: Record<string, string[]>;
}

export interface PartitionedHits<T> {
    resolved: Array<{ hit: EsHit; subject: T }>;
    /** Subject ids present in Elasticsearch but missing from the database. */
    orphanedIds: string[];
    /** Subject ids the index says are visible but the database says are not
     *  (e.g. their meeting was unreleased after indexing). */
    unreleasedIds: string[];
    droppedWithoutSource: number;
}

/**
 * Splits ES hits into those that resolve against the database and those that
 * don't. Orphaned hits (indexed subjects with no DB row) are expected when the
 * index and the database drift — e.g. staging reads the production index, or
 * PGSync lags behind a deletion — and must degrade search results, not fail them.
 *
 * The same drift can leave a hit pointing at a subject whose meeting the
 * database no longer marks released, even though the ES query filters on the
 * indexed released flag. `isVisible` re-checks against the hydrated DB row —
 * the first place index claims meet database truth — so every consumer of
 * search() gets the release re-check, and the drop counts (which callers use
 * to adjust or withhold totals) see all drop classes in one place.
 */
export function partitionHits<T>(
    hits: EsHit[],
    subjectMap: Map<string, T>,
    isVisible?: (subject: T) => boolean,
): PartitionedHits<T> {
    const resolved: Array<{ hit: EsHit; subject: T }> = [];
    const orphanedIds: string[] = [];
    const unreleasedIds: string[] = [];
    let droppedWithoutSource = 0;

    for (const hit of hits) {
        const id = hit._source?.id;
        if (id === undefined) {
            droppedWithoutSource++;
            continue;
        }
        const subject = subjectMap.get(id);
        if (subject === undefined) {
            orphanedIds.push(id);
            continue;
        }
        if (isVisible && !isVisible(subject)) {
            unreleasedIds.push(id);
            continue;
        }
        resolved.push({ hit, subject });
    }

    return { resolved, orphanedIds, unreleasedIds, droppedWithoutSource };
}

// Each id alerts once per server instance, not once per search (resets on
// deploy). Keyed by source as well as id: the related-subjects path re-checks
// its ids on every subject page view, and must not spend the one alert a
// later typed search would have raised for the same id.
const reportedKeys = new Set<string>();
const MISSING_SOURCE_KEY = '__missing_source__';
// Separate keyspace: the same subject can be orphaned and (earlier) unreleased.
const unreleasedKey = (id: string) => `unreleased:${id}`;

/**
 * Best-effort, never throws: Discord alert on production, console warning
 * elsewhere (see partitionHits for why drift is expected outside production).
 * `source` names the caller in the alert, as failSearch does, so a drop on
 * the related-subjects path does not read as a search somebody typed.
 */
export async function reportOrphanedHits(
    params: { orphanedIds: string[]; unreleasedIds?: string[]; droppedWithoutSource?: number; query: string; index: string; source: string },
): Promise<void> {
    const reported = (key: string) => reportedKeys.has(`${params.source}:${key}`);
    const remember = (key: string) => reportedKeys.add(`${params.source}:${key}`);

    const newIds = [...new Set(params.orphanedIds)].filter(id => !reported(id));
    const newUnreleased = [...new Set(params.unreleasedIds ?? [])].filter(id => !reported(unreleasedKey(id)));
    const missingSource = (params.droppedWithoutSource ?? 0) > 0 && !reported(MISSING_SOURCE_KEY)
        ? params.droppedWithoutSource ?? 0
        : 0;
    if (newIds.length === 0 && newUnreleased.length === 0 && missingSource === 0) return;

    newIds.forEach(remember);
    newUnreleased.forEach(id => remember(unreleasedKey(id)));
    if (missingSource > 0) remember(MISSING_SOURCE_KEY);

    const parts: string[] = [];
    if (newIds.length > 0) parts.push(`${newIds.length} orphaned hit(s) — subjects in index "${params.index}" missing from the database`);
    if (newUnreleased.length > 0) parts.push(`${newUnreleased.length} stale unreleased hit(s) — the index says released, the database disagrees (check PGSync / reindex)`);
    if (missingSource > 0) parts.push(`${missingSource} hit(s) without _source`);
    const message = `Dropped ${parts.join(' and ')} from the ${params.source.toLowerCase()} results.`;

    if (env.DEPLOYMENT_ENV !== 'production') {
        console.warn(`[${params.source}] ${message}`, { orphanedIds: newIds, unreleasedIds: newUnreleased, query: params.query });
        return;
    }

    await sendErrorAdminAlert({
        source: params.source,
        error: message,
        context: {
            orphanedSubjectIds: newIds.length > 0 ? newIds.join(', ') : undefined,
            unreleasedSubjectIds: newUnreleased.length > 0 ? newUnreleased.join(', ') : undefined,
            droppedWithoutSource: missingSource > 0 ? String(missingSource) : undefined,
            query: params.query,
            index: params.index,
        },
    });
}
