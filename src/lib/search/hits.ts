import { sendErrorAdminAlert } from '@/lib/discord';
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

// Each id alerts once per server instance, not once per search (resets on deploy).
const reportedIds = new Set<string>();
const MISSING_SOURCE_KEY = '__missing_source__';
// Separate keyspace: the same subject can be orphaned and (earlier) unreleased.
const unreleasedKey = (id: string) => `unreleased:${id}`;

/**
 * Best-effort, never throws: Discord alert on production, console warning
 * elsewhere (see partitionHits for why drift is expected outside production).
 */
export async function reportOrphanedHits(
    params: { orphanedIds: string[]; unreleasedIds?: string[]; droppedWithoutSource?: number; query: string; index: string },
): Promise<void> {
    const newIds = [...new Set(params.orphanedIds)].filter(id => !reportedIds.has(id));
    const newUnreleased = [...new Set(params.unreleasedIds ?? [])].filter(id => !reportedIds.has(unreleasedKey(id)));
    const missingSource = (params.droppedWithoutSource ?? 0) > 0 && !reportedIds.has(MISSING_SOURCE_KEY)
        ? params.droppedWithoutSource ?? 0
        : 0;
    if (newIds.length === 0 && newUnreleased.length === 0 && missingSource === 0) return;

    newIds.forEach(id => reportedIds.add(id));
    newUnreleased.forEach(id => reportedIds.add(unreleasedKey(id)));
    if (missingSource > 0) reportedIds.add(MISSING_SOURCE_KEY);

    const parts: string[] = [];
    if (newIds.length > 0) parts.push(`${newIds.length} orphaned hit(s) — subjects in index "${params.index}" missing from the database`);
    if (newUnreleased.length > 0) parts.push(`${newUnreleased.length} stale unreleased hit(s) — the index says released, the database disagrees (check PGSync / reindex)`);
    if (missingSource > 0) parts.push(`${missingSource} hit(s) without _source`);
    const message = `Dropped ${parts.join(' and ')} from search results.`;

    if (env.DEPLOYMENT_ENV !== 'production') {
        console.warn(`[Search] ${message}`, { orphanedIds: newIds, unreleasedIds: newUnreleased, query: params.query });
        return;
    }

    await sendErrorAdminAlert({
        source: 'Search',
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
