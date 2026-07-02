import { NextRequest, NextResponse } from 'next/server';
import { getCityAtPoint } from '@/lib/db/cities';

// Dynamic point lookup, nothing to cache against per-request.
export const dynamic = 'force-dynamic';

// The municipality containing the given point — { id, name, officialSupport, geometry }
// or null. Used by the landing map to highlight a clicked municipality.
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const lng = Number(searchParams.get('lng'));
    const lat = Number(searchParams.get('lat'));
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return NextResponse.json({ error: 'lng and lat are required' }, { status: 400 });
    }
    try {
        const city = await getCityAtPoint(lng, lat);
        return NextResponse.json(city);
    } catch (error) {
        console.error('Error resolving city at point:', error);
        return NextResponse.json({ error: 'Failed to resolve city at point' }, { status: 500 });
    }
}
