import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logSearchQuery } from '@/lib/db/searchQueries';
import { getRealm } from '@/lib/realm.server';
import { getTopics } from '@/lib/db/topics';
import { getListedCitiesCached } from '@/lib/db/cities';
import { detectCategoryQuery, detectMunicipalityQuery } from '@/lib/landing/landingData';

// Logs a landing search so the popular-searches chips reflect what people actually look
// for. The caller's text and kind are untrusted: the query is re-resolved here against the
// realm's actual topics/municipalities and the CANONICAL matched name is stored (the fuzzy
// matchers accept e.g. "<topic name><arbitrary suffix>", so storing raw text would let a
// crafted phrase reach the public chips). No match → dropped. Address queries never reach
// this endpoint (people type their home address; the client doesn't send them and no
// topic/municipality resolves for them anyway).
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
    query: z.string().trim().min(1).max(100),
    kind: z.enum(['category', 'municipality']),
});

export async function POST(request: Request) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { query, kind } = parsed.data;
    const realm = await getRealm();

    let canonical: string | null = null;
    if (kind === 'category') {
        const topics = await getTopics(realm);
        const topicId = detectCategoryQuery(query, topics);
        canonical = topics.find((t) => t.id === topicId)?.name ?? null;
    } else {
        const cities = await getListedCitiesCached(realm);
        const match = detectMunicipalityQuery(query, cities);
        canonical = match?.kind === 'known' ? match.name : null;
    }

    if (canonical) {
        await logSearchQuery(canonical, { source: 'landing' });
    }
    return NextResponse.json({ ok: true });
}
