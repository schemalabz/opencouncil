import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/env.mjs';
import { getCityCached, getCityIdForGeohashCached } from '@/lib/cache';
import { parseEmbedConfig } from '@/lib/utils/embedParams';
import { getRecentHotSubjects, getHotSubjectsNearGeohash, type HotSubject } from '@/lib/hotSubjects';
import { getLocationDistancesFromPoint } from '@/lib/db/location';
import { isValidGeohash, decodeGeohashToCenter } from '@/lib/geo';

/**
 * Public pre-flight endpoint for the subjects embed widget. Returns the same
 * ranked subjects the widget at /embed/subjects renders, as JSON — so an
 * embedding site can decide whether to render the iframe at all (e.g. collapse
 * the container when `count` is 0).
 *
 * Accepts the widget's data params: cityId, geohash, limit, bodies, bodyIds.
 * One of cityId/geohash is required; with only a geohash, the municipality is
 * resolved server-side (point-in-polygon on the cell center).
 */

const CACHE_HEADERS = {
    // Same CDN policy as the widget page (revalidate 300, SWR 1h), and CORS
    // open: embedders call this from their own site's JavaScript.
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    'Access-Control-Allow-Origin': '*',
};

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: CACHE_HEADERS });
}

export async function GET(req: NextRequest) {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());

    const geohash = params.geohash && isValidGeohash(params.geohash)
        ? params.geohash.toLowerCase()
        : null;
    if (params.geohash && !geohash) {
        return json({ error: 'Invalid geohash: expected 6 base-32 characters' }, 400);
    }
    if (!params.cityId && !geohash) {
        return json({ error: 'Provide cityId and/or geohash' }, 400);
    }

    // Same municipality resolution as the widget page.
    const geohashCityId = geohash ? await getCityIdForGeohashCached(geohash) : null;
    const cityId = params.cityId ?? geohashCityId;
    const inSupportedMunicipality = geohash ? geohashCityId !== null : null;

    const city = cityId ? await getCityCached(cityId) : null;
    if (params.cityId && !city) {
        return json({ error: `Unknown cityId: ${params.cityId}` }, 404);
    }

    const { limit, administrativeBodyTypes, administrativeBodyIds } = parseEmbedConfig(params);
    const baseUrl = env.NEXTAUTH_URL.replace(/\/$/, '');

    const top: HotSubject[] = city
        ? geohash
            ? await getHotSubjectsNearGeohash(city.id, geohash, { limit, administrativeBodyTypes, administrativeBodyIds })
            : await getRecentHotSubjects(city.id, { limit, administrativeBodyTypes, administrativeBodyIds })
        : [];

    // Distance (m) from the geohash cell center to each located subject.
    const distances = geohash
        ? await getLocationDistancesFromPoint(
            top.map(t => t.subject.locationId).filter((id): id is string => id != null),
            decodeGeohashToCenter(geohash),
        )
        : new Map<string, number>();

    const subjects = top.map(({ subject, meeting }) => ({
        id: subject.id,
        name: subject.name,
        url: `${baseUrl}/${meeting.cityId}/${meeting.id}/subjects/${subject.id}`,
        meetingDate: meeting.dateTime,
        topic: subject.topic ? { name: subject.topic.name, colorHex: subject.topic.colorHex } : null,
        /** Meters from the geohash cell center; null for municipality-wide (no-location) subjects. */
        distanceMeters: (subject.locationId && distances.get(subject.locationId)) ?? null,
    }));

    const located = subjects.map(s => s.distanceMeters).filter((d): d is number => d !== null);

    return json({
        cityId: city?.id ?? null,
        /** Whether the geohash cell center falls inside a covered municipality; null when no geohash was given. */
        inSupportedMunicipality,
        count: subjects.length,
        closestSubjectDistanceMeters: located.length > 0 ? Math.min(...located) : null,
        subjects,
    });
}
