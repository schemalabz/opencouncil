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
