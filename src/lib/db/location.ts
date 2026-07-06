"use server";

import { Location, LocationType, Prisma } from '@prisma/client';
import prisma from "./prisma";

/**
 * Create a new location
 */
export async function createLocation(data: {
    text: string;
    coordinates: [number, number]; // [longitude, latitude]
}): Promise<Location> {
    const { text, coordinates } = data;
    const [longitude, latitude] = coordinates;

    console.log('Creating location:', text, coordinates);
    try {
        // Create a new location with proper PostGIS geometry and explicit UUID generation
        // The Location model doesn't have explicit createdAt/updatedAt fields
        const result = await prisma.$queryRaw<Location[]>`
            INSERT INTO "Location" ("id", "text", "type", "coordinates")
            VALUES (
                gen_random_uuid(),
                ${text}, 
                'point'::"LocationType", 
                ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
            )
            RETURNING id, text, type;
        `;

        if (!result || result.length === 0) {
            throw new Error('Failed to create location: no result returned');
        }

        // Fetch the complete location record
        const location = await prisma.location.findUnique({
            where: { id: result[0].id }
        });

        if (!location) {
            throw new Error('Failed to retrieve newly created location');
        }

        console.log('Location created successfully:', location);
        return location;
    } catch (error) {
        console.error('Error creating location:', error);
        throw new Error('Failed to create location');
    }
}

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
 * `distanceInMeters` of `center` ([lng, lat]).
 *
 * Handles the known data issue where some location points were stored with
 * lat/lng swapped: if a point's stored coordinates fall outside Greece's
 * bounding box, we swap X/Y before measuring (mirrors calculateProximityMatches
 * in notifications.ts). Only `point` locations participate; other geometry
 * types are ignored.
 */
export async function filterLocationIdsWithinRadius(
    locationIds: string[],
    center: [number, number], // [longitude, latitude]
    distanceInMeters: number
): Promise<string[]> {
    if (locationIds.length === 0) return [];
    const [lng, lat] = center;

    try {
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "Location"
            WHERE id = ANY(${locationIds}::text[])
              AND type = 'point'
              AND ST_DWithin(
                CASE
                  WHEN ST_X(coordinates::geometry) < 19.5 OR ST_X(coordinates::geometry) > 28.5
                    OR ST_Y(coordinates::geometry) < 34.5 OR ST_Y(coordinates::geometry) > 41.5
                  THEN ST_SetSRID(ST_MakePoint(ST_Y(coordinates::geometry), ST_X(coordinates::geometry)), 4326)::geography
                  ELSE coordinates::geography
                END,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                ${distanceInMeters}
              )
        `;
        return rows.map(r => r.id);
    } catch (error) {
        console.error('Error filtering locations within radius:', error);
        return [];
    }
}

/**
 * Distance in meters from `center` ([lng, lat]) to each of the given point
 * locations. Same swapped-coordinate handling as filterLocationIdsWithinRadius;
 * non-point locations are omitted from the result.
 */
export async function getLocationDistancesFromPoint(
    locationIds: string[],
    center: [number, number] // [longitude, latitude]
): Promise<Map<string, number>> {
    if (locationIds.length === 0) return new Map();
    const [lng, lat] = center;

    try {
        const rows = await prisma.$queryRaw<Array<{ id: string; meters: number }>>`
            SELECT id, ST_Distance(
                CASE
                  WHEN ST_X(coordinates::geometry) < 19.5 OR ST_X(coordinates::geometry) > 28.5
                    OR ST_Y(coordinates::geometry) < 34.5 OR ST_Y(coordinates::geometry) > 41.5
                  THEN ST_SetSRID(ST_MakePoint(ST_Y(coordinates::geometry), ST_X(coordinates::geometry)), 4326)::geography
                  ELSE coordinates::geography
                END,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              ) AS meters
            FROM "Location"
            WHERE id = ANY(${locationIds}::text[])
              AND type = 'point'
        `;
        return new Map(rows.map(r => [r.id, Math.round(r.meters)]));
    } catch (error) {
        console.error('Error measuring location distances:', error);
        return new Map();
    }
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
