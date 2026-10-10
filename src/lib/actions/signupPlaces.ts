"use server";

import * as z from "zod";
import { env } from "@/env.mjs";
import { createCache, getAllCitiesMinimalCached, getCityWithGeometryCached } from "@/lib/cache";
import { isPointInGeometry } from "@/lib/geo";
import { getHotSubjectsNearPoint, withDistances } from "@/lib/hotSubjects";
import { subjectPath } from "@/lib/landing/landingData";
import { getRealmGeocoding } from "@/lib/realm";
import { getRealm } from "@/lib/realm.server";
import type { Location } from "@/lib/types/onboarding";
import { DEFAULT_HOT_PERIOD, HOT_PERIODS, isBeyondPeriod } from "@/lib/utils/hotTopicFilters";

/**
 * The places step of the notifications signup: what the council discussed
 * near a place the reader adds, and a place for the reader's current
 * position. Both are public: the signup runs before there is an account.
 *
 * Both refuse a city that is not in the request's realm or does not take
 * notifications before they touch a per-city cache, so made-up ids cannot
 * grow the shared cache.
 */

/** The 'wide' radius of the email matching. Notis measures from the same pins. */
const NEARBY_RADIUS_METERS = 1500;
const NEARBY_LIMIT = 3;
/**
 * Positions snap to a grid of about 110 m before they reach Google. A street
 * or an area is all the step keeps, and a finite grid bounds the lookups a
 * caller can force: each cell is asked once, then served from the cache.
 */
const POSITION_DECIMALS = 3;
const GEOCODE_CACHE_SECONDS = 30 * 24 * 60 * 60;

const pointSchema = z.object({
    cityId: z.string().min(1).max(64),
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
});

type PointInput = z.input<typeof pointSchema>;

async function isSignupCity(cityId: string): Promise<boolean> {
    const cities = await getAllCitiesMinimalCached(await getRealm());
    return cities.some((city) => city.id === cityId && city.supportsNotifications);
}

export interface NearbySubject {
    id: string;
    name: string;
    /** The subject's page, without the locale. */
    path: string;
    topic: { name: string; name_en: string; colorHex: string } | null;
    /** ISO date of the meeting that discussed it. */
    meetingDate: string;
    distanceMeters: number;
}

export interface NearbySubjects {
    subjects: NearbySubject[];
    /**
     * ISO date of the oldest meeting the scan covered, or null when there was
     * none. A period with no meetings falls back to the most recent ones, which
     * reach further back, so an empty answer must say since when.
     */
    since: string | null;
    /**
     * The period held no meetings, so these subjects come from older ones.
     * The card must not call them recent.
     */
    beyondPeriod: boolean;
}

/**
 * Up to three hot subjects pinned near the point, over the city page's default
 * period and ranked the way the city page ranks them. Subjects with no pinned
 * location are left out: the card answers "what happened near here", not
 * "what happened".
 */
export async function getNearbySubjects(input: PointInput): Promise<NearbySubjects> {
    const { cityId, lng, lat } = pointSchema.parse(input);
    if (!(await isSignupCity(cityId))) return { subjects: [], since: null, beyondPeriod: false };

    const center: [number, number] = [lng, lat];
    const { subjects, oldestMeetingDate } = await getHotSubjectsNearPoint(cityId, center, NEARBY_RADIUS_METERS, NEARBY_LIMIT * 3, {
        months: HOT_PERIODS[DEFAULT_HOT_PERIOD].months,
    });
    const ranked = await withDistances(subjects, center);

    const nearby = ranked
        .flatMap(({ subject, meeting, distanceMeters }) =>
            distanceMeters === null
                ? []
                : [
                      {
                          id: subject.id,
                          name: subject.name,
                          path: subjectPath(meeting.cityId, meeting.id, subject.id),
                          topic: subject.topic
                              ? { name: subject.topic.name, name_en: subject.topic.name_en, colorHex: subject.topic.colorHex }
                              : null,
                          // A string, not a Date, when the meetings come off a cache hit.
                          meetingDate: new Date(meeting.dateTime).toISOString(),
                          distanceMeters,
                      },
                  ],
        )
        .slice(0, NEARBY_LIMIT);
    return {
        subjects: nearby,
        since: oldestMeetingDate ? new Date(oldestMeetingDate).toISOString() : null,
        beyondPeriod: isBeyondPeriod(DEFAULT_HOT_PERIOD, nearby.map((subject) => subject.meetingDate)),
    };
}

export type ReverseGeocodeResult =
    | { ok: true; location: Location }
    | { ok: false; reason: "outside" | "not_found" | "unavailable" };

type GeocodeResponse = {
    status?: string;
    error_message?: string;
    results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
};

/**
 * Google's street or area at a grid cell, as a place inside the municipality.
 * Google's own coordinate for a street or an area near the boundary can fall
 * outside it, so the first result inside wins. A key or quota failure throws,
 * which keeps it out of the cache.
 */
async function geocodeCell(
    lat: number,
    lng: number,
    language: string,
    geometry: GeoJSON.Geometry,
): Promise<Location | null> {
    const params = new URLSearchParams({
        latlng: `${lat},${lng}`,
        result_type: "route|neighborhood|sublocality|locality",
        language,
        key: env.GOOGLE_API_KEY ?? "",
    });
    const data = (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`).then((r) =>
        r.json(),
    )) as GeocodeResponse;

    if (data.status === "ZERO_RESULTS") return null;
    if (data.status !== "OK") {
        // REQUEST_DENIED (Geocoding API not enabled on the key), OVER_QUERY_LIMIT, …
        throw new Error(`Reverse geocode failed: ${data.status} ${data.error_message ?? ""}`.trim());
    }
    for (const result of data.results ?? []) {
        const { lat: placeLat, lng: placeLng } = result.geometry.location;
        if (isPointInGeometry([placeLng, placeLat], geometry)) {
            return { text: result.formatted_address, coordinates: [placeLng, placeLat] };
        }
    }
    return null;
}

/**
 * The reader's current position as a place: the street or the area around
 * it, never the building. The place keeps that street's or area's own
 * coordinates, not the position, because the step promises that an area is
 * enough.
 */
export async function reverseGeocodePlace(input: PointInput): Promise<ReverseGeocodeResult> {
    const parsed = pointSchema.parse(input);
    const lat = Number(parsed.lat.toFixed(POSITION_DECIMALS));
    const lng = Number(parsed.lng.toFixed(POSITION_DECIMALS));

    // Checked before Google is asked: the action is public, and a point
    // outside the municipality is never a place this signup can keep.
    if (!(await isSignupCity(parsed.cityId))) return { ok: false, reason: "outside" };
    const city = await getCityWithGeometryCached(parsed.cityId);
    // The reader's own position decides inside or outside: near the boundary,
    // the grid cell's corner can fall on the other side.
    if (!city?.geometry || !isPointInGeometry([parsed.lng, parsed.lat], city.geometry)) {
        return { ok: false, reason: "outside" };
    }
    if (!env.GOOGLE_API_KEY) return { ok: false, reason: "unavailable" };

    const geometry = city.geometry;
    const { language } = getRealmGeocoding(city.realm);
    try {
        const location = await createCache(
            () => geocodeCell(lat, lng, language, geometry),
            ["signup", "reverseGeocode", parsed.cityId, language, `${lat},${lng}`],
            { tags: [`city:${parsed.cityId}:geometry`], revalidate: GEOCODE_CACHE_SECONDS },
        )();
        return location ? { ok: true, location } : { ok: false, reason: "not_found" };
    } catch (error) {
        console.error("Reverse geocode error:", error);
        return { ok: false, reason: "unavailable" };
    }
}
