import { NextRequest, NextResponse } from 'next/server';
import { getCityAtPoint } from '@/lib/db/cities';
import { getRealm } from '@/lib/realm.server';

export const dynamic = 'force-dynamic';

// The realm's municipality containing the given point (or null) — highlights a clicked δήμος.
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const lng = Number(searchParams.get('lng'));
    const lat = Number(searchParams.get('lat'));
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return NextResponse.json({ error: 'lng and lat are required' }, { status: 400 });
    }
    try {
        const city = await getCityAtPoint(await getRealm(), lng, lat);
        return NextResponse.json(city);
    } catch (error) {
        console.error('Error resolving city at point:', error);
        return NextResponse.json({ error: 'Failed to resolve city at point' }, { status: 500 });
    }
}
