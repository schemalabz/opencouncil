import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/env.mjs';
import { getRealm } from '@/lib/realm.server';
import { getRealmGeocoding } from '@/lib/realm';

// Geocode a free-text address (Google Geocoding, biased to the request's realm) so search can
// fly the map to it. The key stays server-side.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q')?.trim();
    if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 });

    const { country, language } = getRealmGeocoding(await getRealm());
    const url =
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}` +
        `&region=${country}&language=${language}&key=${env.GOOGLE_API_KEY}`;

    try {
        const data = (await fetch(url).then((r) => r.json())) as {
            status?: string;
            error_message?: string;
            results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
        };
        const result = data.results?.[0];
        if (data.status !== 'OK' || !result) {
            // ZERO_RESULTS = address not found; anything else (REQUEST_DENIED — Geocoding API
            // not enabled on the key — OVER_QUERY_LIMIT, …) is a key/config problem.
            if (data.status !== 'ZERO_RESULTS') {
                console.error('Geocode error:', data.status, data.error_message);
            }
            return NextResponse.json({ status: data.status ?? 'NO_RESULTS' });
        }
        const { lat, lng } = result.geometry.location;
        return NextResponse.json({ lng, lat, formatted: result.formatted_address });
    } catch (error) {
        console.error('Geocode error:', error);
        return NextResponse.json({ error: 'Geocode failed' }, { status: 502 });
    }
}
