import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getRealm } from '@/lib/realm.server'

// Cooperating municipalities with their centroid + logo, for the landing's
// "Municipalities map" mode (one logo marker per δήμος, click → city page).
// Kept separate from /api/cities so that shared endpoint isn't burdened with a
// PostGIS centroid computation. Mirrors the officialSupport + realm gating of
// /api/map/subjects, so the two stay consistent.
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const realm = await getRealm();
        const rows = await prisma.$queryRaw<
            Array<{
                id: string;
                name: string;
                name_municipality: string;
                logoImage: string | null;
                lng: number;
                lat: number;
                geometry: string | null;
            }>
        >`
            SELECT id, name, name_municipality, "logoImage",
                   ST_X(ST_Centroid(geometry)) AS lng,
                   ST_Y(ST_Centroid(geometry)) AS lat,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry, 0.001)) AS geometry
            FROM "City"
            WHERE "officialSupport" = true
              AND realm = ${realm}::"Realm"
              AND geometry IS NOT NULL
        `;
        return NextResponse.json(
            rows.map((r) => ({
                id: r.id,
                name: r.name,
                nameMunicipality: r.name_municipality,
                logoImage: r.logoImage,
                lng: Number(r.lng),
                lat: Number(r.lat),
                geometry: r.geometry ? (JSON.parse(r.geometry) as GeoJSON.Geometry) : null,
            })),
        );
    } catch (error) {
        console.error('Error fetching map cities:', error);
        return NextResponse.json({ error: 'Failed to fetch map cities' }, { status: 500 });
    }
}
