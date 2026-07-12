import { NextResponse } from 'next/server';
import { getRealm } from '@/lib/realm.server';
import { getPopularSearchQueriesCached } from '@/lib/db/searchQueries';

// Most-repeated real search queries of the realm, for the landing's "Δημοφιλείς αναζητήσεις"
// chips. The client blends these with a curated list (real ones first) while the search
// history is still thin. Dynamic for the Host-header realm; the query itself is cached.
export const dynamic = 'force-dynamic';

export async function GET() {
    const keywords = await getPopularSearchQueriesCached(await getRealm());
    return NextResponse.json({ keywords });
}
