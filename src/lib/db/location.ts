"use server";

import { Location } from '@prisma/client';
import prisma from "./prisma";

// Note: locations are created inside saveNotificationPreferences /
// saveSubjectsForMeeting (in the same transaction as the row that references
// them), not by a standalone action here — that avoids orphaned Location rows
// and keeps this write off the public Server Action surface.

/**
 * Find locations by coordinates within a certain distance
 */
export async function findNearbyLocations(data: {
    coordinates: [number, number]; // [longitude, latitude]
    distanceInMeters: number;
    limit?: number;
}): Promise<Location[]> {
    const { coordinates, distanceInMeters, limit = 10 } = data;

    try {
        const locations = await prisma.$queryRaw<Location[]>`
            SELECT * FROM "Location"
            WHERE ST_DWithin(
                "coordinates"::geography,
                ST_SetSRID(ST_MakePoint(${coordinates[0]}, ${coordinates[1]}), 4326)::geography,
                ${distanceInMeters}
            )
            LIMIT ${limit}
        `;

        return locations || [];
    } catch (error) {
        console.error('Error finding nearby locations:', error);
        return [];
    }
}

/**
 * From a set of location ids, return those whose point lies within
 * `distanceInMeters` of `center` ([lng, lat]). Only `point` locations
 * participate; other geometry types are ignored.
 */
export async function filterLocationIdsWithinRadius(
    locationIds: string[],
    center: [number, number], // [longitude, latitude]
    distanceInMeters: number
): Promise<string[]> {
    if (locationIds.length === 0) return [];
    const [lng, lat] = center;

    // Throws on query failure rather than returning [] — an empty result is a
    // positive claim ("nothing pinned nearby") that callers publish, so a
    // transient DB error must stay distinguishable from a quiet neighbourhood.
    // Callers that prefer a degraded answer over an error (the embed widget)
    // catch at their own boundary.
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Location"
        WHERE id = ANY(${locationIds}::text[])
          AND type = 'point'
          AND ST_DWithin(
            coordinates::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${distanceInMeters}
          )
    `;
    return rows.map(r => r.id);
}

/**
 * Distance in meters from `center` ([lng, lat]) to each of the given point
 * locations. Non-point locations are omitted from the result.
 */
export async function getLocationDistancesFromPoint(
    locationIds: string[],
    center: [number, number] // [longitude, latitude]
): Promise<Map<string, number>> {
    if (locationIds.length === 0) return new Map();
    const [lng, lat] = center;

    // Throws on query failure — see filterLocationIdsWithinRadius: an empty
    // map reads as "no pinned locations", which is a claim, not an error state.
    const rows = await prisma.$queryRaw<Array<{ id: string; meters: number }>>`
            SELECT id, ST_Distance(
                coordinates::geography,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              ) AS meters
            FROM "Location"
            WHERE id = ANY(${locationIds}::text[])
              AND type = 'point'
        `;
    return new Map(rows.map(r => [r.id, Math.round(r.meters)]));
}

/**
 * Get location by ID
 */
export async function getLocation(id: string): Promise<Location | null> {
    try {
        return await prisma.location.findUnique({
            where: { id }
        });
    } catch (error) {
        console.error('Error getting location:', error);
        return null;
    }
}
