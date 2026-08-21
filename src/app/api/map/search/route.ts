import { NextResponse } from 'next/server'
import { AdministrativeBodyType } from '@prisma/client'
import { getRealm } from '@/lib/realm.server'
import { getGeneralSubjects, getMapSubjects } from '@/lib/db/subject'
import { searchSubjectsInRealm } from '@/lib/search/core'

// Per-query, and every query is different. Nothing to cache.
export const dynamic = 'force-dynamic';

/**
 * The most results one search puts on the map.
 *
 * Above ~150 pins the map degrades them to plain dots, so a larger set buys no
 * fidelity — and it costs: the marker layer rebuilds on every viewport change,
 * its packing pass is roughly quadratic, and each pin mounts its own root.
 * Measured against the production index, the broadest single-word queries land
 * in the low hundreds, so the cap bites rarely and the response says when it did.
 */
const MAX_RESULTS = 150;

const isBodyType = (b: string): b is AdministrativeBodyType =>
    (Object.values(AdministrativeBodyType) as string[]).includes(b);

const list = (value: string | null) => (value || '').split(',').filter(Boolean);

/**
 * Search, answered in the landing map's own shape.
 *
 * Elasticsearch ranks; Postgres hydrates. The rows come back through the same
 * finders that back /api/map/subjects, so the client's existing transforms,
 * pins and cards take them unchanged — and they carry the discussion time a
 * search result never had.
 *
 * `order` is the relevance order. The rows are not in it: they arrive in
 * whatever order the database returned, and the client sorts by this.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = (searchParams.get('q') || '').trim();
        if (!query) {
            return NextResponse.json({ error: 'A query is required' }, { status: 400 });
        }

        const realm = await getRealm();
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        const { hits, total, dropped, derivedFilters } = await searchSubjectsInRealm({
            query,
            cityIds: list(searchParams.get('cityIds')),
            topicIds: list(searchParams.get('topicIds')),
            adminBodyTypes: list(searchParams.get('bodyType')).filter(isBodyType),
            dateRange: dateFrom && dateTo ? { start: dateFrom, end: dateTo } : undefined,
            config: { enableSemanticSearch: true, size: MAX_RESULTS },
        }, realm);

        const subjectIds = hits.map(hit => hit.id);
        if (subjectIds.length === 0) {
            return NextResponse.json({ located: [], general: [], order: [], total: 0, truncated: false, derivedFilters });
        }

        // The search already applied the date window; re-applying the map's
        // default one here would drop results for being older than three months.
        const hydrateFilters = { allTime: true, subjectIds };
        const [located, general] = await Promise.all([
            getMapSubjects(realm, hydrateFilters),
            getGeneralSubjects(realm, hydrateFilters),
        ]);

        return NextResponse.json({
            located,
            general,
            order: subjectIds,
            // Count what came back, not what the index claimed: hydration drops
            // subjects the map excludes anyway, and the index's own total is
            // approximate whenever it had to withhold hits.
            total: located.length + general.reduce((sum, city) => sum + city.subjects.length, 0),
            truncated: total > MAX_RESULTS || dropped > 0,
            derivedFilters,
        });
    } catch (error) {
        console.error('Error searching subjects for map:', error);
        return NextResponse.json({ error: 'Failed to search subjects' }, { status: 500 });
    }
}
