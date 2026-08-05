import { sendErrorAdminAlert } from '@/lib/discord';
import { env } from '@/env.mjs';

interface EsInnerHit {
    _source?: { segment_id?: string };
}

export interface EsHit {
    _score?: number | null;
    _source?: { id?: string };
    inner_hits?: Record<string, { hits?: { hits?: EsInnerHit[] } }>;
}

export interface PartitionedHits<T> {
    resolved: Array<{ hit: EsHit; subject: T }>;
    /** Subject ids present in Elasticsearch but missing from the database. */
    orphanedIds: string[];
    droppedWithoutSource: number;
}

/**
 * Splits ES hits into those that resolve against the database and those that
 * don't. Orphaned hits (indexed subjects with no DB row) are expected when the
 * index and the database drift — e.g. staging reads the production index, or
 * PGSync lags behind a deletion — and must degrade search results, not fail them.
 */
export function partitionHits<T>(hits: EsHit[], subjectMap: Map<string, T>): PartitionedHits<T> {
    const resolved: Array<{ hit: EsHit; subject: T }> = [];
    const orphanedIds: string[] = [];
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
        resolved.push({ hit, subject });
    }

    return { resolved, orphanedIds, droppedWithoutSource };
}

// Each id alerts once per server instance, not once per search (resets on deploy).
const reportedOrphanIds = new Set<string>();
const MISSING_SOURCE_KEY = '__missing_source__';

/**
 * Best-effort, never throws: Discord alert on production, console warning
 * elsewhere (see partitionHits for why drift is expected outside production).
 */
export async function reportOrphanedHits(
    params: { orphanedIds: string[]; droppedWithoutSource?: number; query: string; index: string },
): Promise<void> {
    const newIds = [...new Set(params.orphanedIds)].filter(id => !reportedOrphanIds.has(id));
    const missingSource = (params.droppedWithoutSource ?? 0) > 0 && !reportedOrphanIds.has(MISSING_SOURCE_KEY)
        ? params.droppedWithoutSource ?? 0
        : 0;
    if (newIds.length === 0 && missingSource === 0) return;

    newIds.forEach(id => reportedOrphanIds.add(id));
    if (missingSource > 0) reportedOrphanIds.add(MISSING_SOURCE_KEY);

    const parts: string[] = [];
    if (newIds.length > 0) parts.push(`${newIds.length} orphaned hit(s) — subjects in index "${params.index}" missing from the database`);
    if (missingSource > 0) parts.push(`${missingSource} hit(s) without _source`);
    const message = `Dropped ${parts.join(' and ')} from search results.`;

    if (env.DEPLOYMENT_ENV !== 'production') {
        console.warn(`[Search] ${message}`, { orphanedIds: newIds, query: params.query });
        return;
    }

    await sendErrorAdminAlert({
        source: 'Search',
        error: message,
        context: {
            orphanedSubjectIds: newIds.length > 0 ? newIds.join(', ') : undefined,
            droppedWithoutSource: missingSource > 0 ? String(missingSource) : undefined,
            query: params.query,
            index: params.index,
        },
    });
}
