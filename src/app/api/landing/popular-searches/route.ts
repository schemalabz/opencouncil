import { NextResponse } from 'next/server';
import { getPopularSearchQueries } from '@/lib/db/searchQueries';

// Most-repeated real search queries, for the landing's "Δημοφιλείς αναζητήσεις" chips.
// The client falls back to a curated list when this returns too few (early on there
// isn't enough search history to surface meaningful suggestions).
export const dynamic = 'force-dynamic';

export async function GET() {
    const keywords = await getPopularSearchQueries();
    return NextResponse.json({ keywords });
}
