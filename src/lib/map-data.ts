"use server";

// This module is responsible for fetching and preparing data for the central map page.
// It reuses existing database queries to avoid code duplication and ensure consistency.

import { MapFeature } from '@/components/map/map';
import prisma from '@/lib/db/prisma';
import { getAllSubjects, SubjectWithRelations } from '@/lib/db/subject';
import { getCitiesWithGeometry } from '@/lib/db/cities';

const SUBJECT_POINT_COLOR = '#E57373'; // From lib/utils.ts for consistency

/**
 * Fetches all listed municipalities and transforms them into MapFeatures.
 * It includes a count of petitions for each municipality.
 */
export async function getMunicipalitiesForMap(cityId: string | null): Promise<MapFeature[]> {
    const results = await prisma.$queryRaw<
        {
            id: string;
            name: string;
            officialSupport: boolean;
            petitionCount: bigint;
            geometry: string | null;
        }[]
    >`
        SELECT 
            c.id, 
            c.name, 
            c."officialSupport",
            COUNT(p.id) as "petitionCount",
            ST_AsGeoJSON(c.geometry)::text AS geometry
        FROM "City" c
        LEFT JOIN "Petition" p ON c.id = p."cityId"
        WHERE c."isListed" = true AND (${cityId}::text IS NULL OR c.id = ${cityId}::text)
        GROUP BY c.id
    `;

    console.log('Raw database query results:', results);

    return results.map((city) => ({
        id: city.id,
        geometry: city.geometry ? JSON.parse(city.geometry) : null,
        properties: {
            name: city.name,
            isSupported: city.officialSupport,
            petitionCount: Number(city.petitionCount),
        },
        style: {
            fillColor: city.officialSupport ? '#FFA500' : '#ADD8E6', // Orange for supported, Light Blue for unsupported
            fillOpacity: 0.5,
            strokeColor: city.officialSupport ? '#FF8C00' : '#87CEEB',
            strokeWidth: 2,
        },
    }));
}

/**
 * Fetches all subjects and transforms them into MapFeatures.
 * TODO: Add filtering logic based on date, category, and discussion duration.
 */
export async function getSubjectsForMap(cityId: string | null): Promise<MapFeature[]> {
    const subjects = await prisma.subject.findMany({
        where: {
            location: {
                isNot: null,
            },
            // The location relation must have coordinates
            // This is a bit of a Prisma limitation, we can't directly filter on the fields of the related model in this way.
            // So we have to filter in code after fetching.
            cityId: cityId ?? undefined,
        },
        include: {
            location: true, // Includes location and its coordinates
        },
    });

    // The initial query doesn't fetch PostGIS coordinates. We need a second raw query.
    const locationIds = subjects
        .map((s) => s.location?.id)
        .filter((id): id is string => !!id);

    let subjectsWithCoords = subjects;

    if (locationIds.length > 0) {
        const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
            SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
            FROM "Location"
            WHERE id = ANY(${locationIds}::text[])
        `;

        const coordsMap = new Map(locationCoordinates.map(l => [l.id, { x: l.x, y: l.y }]));

        // Merge coordinates back into the subjects array
        subjectsWithCoords = subjects.map(subject => {
            if (subject.locationId) {
                const coordinates = coordsMap.get(subject.locationId);
                // Attach coordinates to the location object
                // @ts-ignore - We are dynamically adding the coordinates property
                subject.location.coordinates = coordinates;
            }
            return subject;
        });
    }

    console.log(`[map-data.ts] Step 1: Fetched ${subjects.length} raw subjects from the database for cityId: '${cityId}'.`);
    // Detailed log of the first few subjects to inspect their structure
    console.log('[map-data.ts] Raw subject data sample:', JSON.stringify(subjectsWithCoords.slice(0, 2), null, 2));


    // Transform subjects to MapFeatures, filtering out those without coordinates.
    // This logic is adapted from `subjectToMapFeature` in `lib/utils.ts`.
    const mapFeatures = subjectsWithCoords
        .map((subject) => {
            // @ts-ignore
            if (!subject.location?.coordinates) {
                return null;
            }

            // The coordinates from the DB are in (x, y). Mapbox GL JS expects [longitude, latitude].
            // PostGIS st_asgeojson outputs x=lon, y=lat, so we need to map them correctly.
            // @ts-ignore
            const coords = subject.location.coordinates;

            // Explicitly create the object as a MapFeature to satisfy TypeScript
            const feature: MapFeature = {
                id: subject.id,
                geometry: {
                    type: 'Point',
                    coordinates: [coords.y, coords.x],
                },
                properties: {
                    name: subject.name,
                    description: subject.description,
                    subjectId: subject.id,
                    cityId: subject.cityId,
                    councilMeetingId: subject.councilMeetingId,
                },
                style: {
                    fillColor: SUBJECT_POINT_COLOR,
                    fillOpacity: 0.8,
                    strokeColor: SUBJECT_POINT_COLOR,
                    strokeWidth: 6,
                },
            };
            return feature;
        })
        .filter((feature): feature is MapFeature => feature !== null);

    console.log(`[map-data.ts] Step 2: Found and transformed ${mapFeatures.length} subjects with valid coordinates for the map.`);

    return mapFeatures;
} 