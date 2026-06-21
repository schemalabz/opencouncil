"use server";
import { City, CouncilMeeting, Prisma, Realm } from '@prisma/client';
import prisma from "./prisma";
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit, getCurrentUser } from "../auth";
import { UnauthorizedError } from "../api/errors";

export type CityGeometryOptions = {
    includeGeometry?: boolean;
};

export type CityWithGeometry = City & {
    geometry?: GeoJSON.Geometry;
};

export type CityWithCouncilMeeting = City & {
    councilMeetings: CouncilMeeting[];
};

type CityCounts = {
    persons: number;
    parties: number;
    councilMeetings: number;
};

export type CityMinimalWithCounts = Pick<City, 'id' | 'name' | 'name_en' | 'name_municipality' | 'name_municipality_en' | 'logoImage' | 'supportsNotifications' | 'status' | 'officialSupport' | 'authorityType'> & {
    _count: CityCounts;
};

export type CityWithCounts = City & {
    _count: CityCounts;
};

// Common configurations for database queries
const CITY_COUNT_SELECT = {
    select: {
        persons: true,
        parties: true,
        councilMeetings: {
            where: {
                released: true
            }
        }
    }
};

const CITY_ORDER_BY = [
    { officialSupport: 'desc' as const },
    { status: 'desc' as const },
    { name: 'asc' as const }
];

export async function deleteCity(id: string): Promise<void> {
    await withUserAuthorizedToEdit({ cityId: id });
    try {
        await prisma.city.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting city:', error);
        throw new Error('Failed to delete city');
    }
}

export async function createCity(cityData: Omit<City, 'createdAt' | 'updatedAt'>): Promise<City> {
    await withUserAuthorizedToEdit({});
    try {
        const newCity = await prisma.city.create({
            data: cityData,
        });
        return newCity;
    } catch (error) {
        console.error('Error creating city:', error);
        throw new Error('Failed to create city');
    }
}

export async function editCity(id: string, cityData: Partial<Omit<City, 'id' | 'createdAt' | 'updatedAt'>>): Promise<City> {
    await withUserAuthorizedToEdit({ cityId: id });
    try {
        const updatedCity = await prisma.city.update({
            where: { id },
            data: cityData,
        });
        return updatedCity;
    } catch (error) {
        console.error('Error editing city:', error);
        throw new Error('Failed to edit city');
    }
}

async function attachGeometryToCity<T extends Pick<City, 'id'>>(
    city: T | null
): Promise<(T & { geometry?: GeoJSON.Geometry }) | null> {
    if (!city) return null;
    const [withGeom] = await attachGeometryToCities([city]);
    return withGeom ?? null;
}

export async function getCity(
    id: string,
    options?: CityGeometryOptions
): Promise<(CityWithCounts & { geometry?: GeoJSON.Geometry }) | null> {
    try {
        const city = await prisma.city.findUnique({
            where: { id },
            include: {
                _count: CITY_COUNT_SELECT
            }
        });
        
        if (!city) return null;
        if (!options?.includeGeometry) return city;
        
        return await attachGeometryToCity(city);
    } catch (error) {
        console.error('Error fetching city:', error);
        throw new Error('Failed to fetch city');
    }
}

export async function getFullCity(
    cityId: string,
    options?: CityGeometryOptions
) {
    const canEdit = await isUserAuthorizedToEdit({ cityId });
    const city = await prisma.city.findUnique({
        where: { id: cityId },
        include: {
            councilMeetings: {
                where: {
                    released: canEdit ? undefined : true
                },
                include: {
                    subjects: {
                        include: {
                            speakerSegments: {
                                include: {
                                    speakerSegment: true
                                }
                            },
                            highlights: true,
                            location: true,
                            topic: true,
                            introducedBy: {
                                include: {
                                    roles: {
                                        include: {
                                            party: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    administrativeBody: true
                }
            },
            parties: true,
            persons: {
                include: {
                    speakerTags: true,
                    roles: {
                        include: {
                            party: true,
                            city: true,
                            administrativeBody: true
                        }
                    }
                }
            },
            administrators: {
                include: {
                    user: true
                }
            }
        }
    });
    
    if (!city) return null;
    if (!options?.includeGeometry) return city;
    
    return await attachGeometryToCity(city);
}

export async function getAllCitiesMinimal(realm?: Realm): Promise<CityMinimalWithCounts[]> {
    try {
        const cities = await prisma.city.findMany({
            where: realm ? { realm } : undefined,
            select: {
                id: true,
                name: true,
                name_en: true,
                name_municipality: true,
                name_municipality_en: true,
                logoImage: true,
                supportsNotifications: true,
                status: true,
                authorityType: true,
                officialSupport: true,
                _count: CITY_COUNT_SELECT
            },
            orderBy: CITY_ORDER_BY
        });
        return cities;
    } catch (error) {
        console.error('Error fetching all cities minimal:', error);
        throw new Error('Failed to fetch all cities');
    }
}

/**
 * All city ids regardless of status. Used to validate route cityId params
 * against the known set before any per-city cached query runs, so junk slugs
 * (bot probes) never create per-city cache entries.
 */
export async function getAllCityIds(realm?: Realm): Promise<string[]> {
    const cities = await prisma.city.findMany({
        where: realm ? { realm } : undefined,
        select: { id: true }
    });
    return cities.map(c => c.id);
}

/**
 * Retrieves cities based on user permissions and city status.
 */
export async function getCities({ includeUnlisted = false, includePending = false }: { includeUnlisted?: boolean, includePending?: boolean } = {}, realm?: Realm): Promise<CityWithCounts[]> {
    // Get current user for authorization
    const currentUser = includeUnlisted ? await getCurrentUser() : null;

    // Validate permissions
    if (includeUnlisted && !currentUser) {
        throw new UnauthorizedError("Not authorized to view unlisted cities");
    }

    // Build where clause based on user permissions
    let whereClause: any = {};

    if (!includeUnlisted && !includePending) {
        // Public mode: only show listed cities
        whereClause.status = 'listed';
    } else if (!includePending) {
        // Include unlisted but exclude pending
        whereClause.status = { in: ['listed', 'unlisted'] };
    } else if (!includeUnlisted) {
        // Include pending but only listed
        whereClause.status = { in: ['listed', 'pending'] };
    }
    // If both includeUnlisted and includePending are true, show all (no filter)

    if (includeUnlisted && !currentUser?.isSuperAdmin) {
        // Authenticated user mode: show listed cities + cities they can administer
        const administerableCityIds = currentUser?.administers
            .filter(a => a.cityId)
            .map(a => a.cityId) || [];

        whereClause = {
            ...whereClause,
            OR: [
                { status: 'listed' },
                {
                    status: { in: ['unlisted', 'pending'] },
                    id: { in: administerableCityIds }
                }
            ]
        };
    }
    // Superadmin mode: show all cities (no additional filter needed)

    // Tenant isolation: restrict to a single realm when one is supplied. Callers
    // serving a public, host-scoped page pass the request realm; cross-realm admin
    // views omit it to see every realm.
    if (realm) {
        whereClause.realm = realm;
    }

    try {
        const cities = await prisma.city.findMany({
            where: whereClause,
            include: {
                _count: CITY_COUNT_SELECT
            },
            orderBy: CITY_ORDER_BY
        });
        return cities;
    } catch (error) {
        console.error('Error fetching cities:', error);
        throw new Error('Failed to fetch cities');
    }
}

export async function getCitiesWithCouncilMeetings({ includeUnlisted = false, includePending = false }: { includeUnlisted?: boolean, includePending?: boolean } = {}, realm?: Realm): Promise<CityWithCouncilMeeting[]> {
    if (includeUnlisted) {
        await withUserAuthorizedToEdit({});
    }

    try {
        let statusFilter: any;
        if (!includeUnlisted && !includePending) {
            statusFilter = 'listed';
        } else if (!includePending) {
            statusFilter = { in: ['listed', 'unlisted'] };
        } else if (!includeUnlisted) {
            statusFilter = { in: ['listed', 'pending'] };
        }
        // If both are true, show all (no filter)

        const whereClause: Prisma.CityWhereInput = {};
        if (statusFilter) whereClause.status = statusFilter;
        if (realm) whereClause.realm = realm;

        const cities = await prisma.city.findMany({
            where: whereClause,
            include: {
                councilMeetings: true
            },
            orderBy: CITY_ORDER_BY
        });
        return cities;
    } catch (error) {
        console.error('Error fetching cities with council meetings:', error);
        throw new Error('Failed to fetch cities with council meetings');
    }
}

/**
 * Attach geometry to a list of cities.
 * This is the core geometry enrichment function; parent methods check the includeGeometry option before calling.
 * Use this directly when you have cities from relations and need to enrich them with geometry.
 * For single city fetches, prefer getCity(id, { includeGeometry: true }) instead.
 */
export async function attachGeometryToCities<T extends Pick<City, 'id'>>(
    cities: T[]
): Promise<Array<T & { geometry?: GeoJSON.Geometry }>> {
    if (cities.length === 0) {
        return cities;
    }

    const cityWithGeometry = await prisma.$queryRaw<
        ({ id: string, geometry: string | null })[]
    >`SELECT 
        c."id" AS id,
        ST_AsGeoJSON(c.geometry)::text AS geometry
    FROM "City" c
    WHERE c.id IN (${Prisma.join(cities.map(city => city.id))})
    `;

    return cities.map(city => {
        const cityGeom = cityWithGeometry.find(c => c.id === city.id);
        const parsed = cityGeom?.geometry ? JSON.parse(cityGeom.geometry) : null;
        return {
            ...city,
            geometry: parsed
        };
    });
}

/**
 * Check if a city can use the city creator tool.
 * Returns true if the city exists and has no existing data, false otherwise.
 */
export async function canUseCityCreator(cityId: string): Promise<boolean> {
    // Check if city exists
    const city = await getCity(cityId);
    if (!city) {
        return false;
    }

    // Check if city has any existing data
    const existingData = await prisma.city.findUnique({
        where: { id: cityId },
        include: {
            parties: true,
            persons: true,
            councilMeetings: true,
            roles: true,
        },
    });

    if (existingData && (
        existingData.parties.length > 0 ||
        existingData.persons.length > 0 ||
        existingData.councilMeetings.length > 0 ||
        existingData.roles.length > 0
    )) {
        return false;
    }

    // City is eligible for city creator
    return true;
}

/**
 * Fetches cities with logos for display purposes (e.g., infinite scroller).
 * Returns only listed cities that have logos.
 */
export async function getSupportedCitiesWithLogos(realm?: Realm): Promise<Array<{ id: string; logoImage: string; name_municipality: string }>> {
    try {
        const cities = await prisma.city.findMany({
            where: {
                officialSupport: true,
                status: 'listed',
                logoImage: {
                    not: null
                },
                ...(realm ? { realm } : {})
            },
            select: {
                id: true,
                logoImage: true,
                name_municipality: true
            },
            orderBy: [
                { officialSupport: 'desc' },
                { name: 'asc' }
            ]
        });

        return cities.filter(city => city.logoImage !== null) as Array<{ id: string; logoImage: string; name_municipality: string }>;
    } catch (error) {
        console.error('Error fetching cities with logos:', error);
        throw new Error('Failed to fetch cities with logos');
    }
}

export interface AboutPageStats {
    municipalityCount: number
    subjectCount: number
    meetingHours: number
}

/**
 * Fetches aggregate stats for the about page:
 * - Number of officially supported municipalities
 * - Total subject count across all released meetings
 * - Total meeting hours (estimated from speaker segment timestamps)
 */
export async function getAboutPageStats(realm?: Realm): Promise<AboutPageStats> {
    try {
        // Realm-scoped join for the raw duration query (the Prisma queries below
        // express realm via the typed `where`).
        const realmJoin = realm
            ? Prisma.sql`JOIN "City" c ON c.id = cm."cityId" AND c.realm = ${realm}::"Realm"`
            : Prisma.empty;

        const [municipalityCount, subjectCount, meetingDurations] = await Promise.all([
            // Count officially supported cities
            prisma.city.count({
                where: { officialSupport: true, ...(realm ? { realm } : {}) }
            }),
            // Count subjects in released meetings only
            prisma.subject.count({
                where: {
                    councilMeeting: { released: true, ...(realm ? { city: { realm } } : {}) }
                }
            }),
            // Get min/max timestamps per meeting to calculate duration
            prisma.$queryRaw<Array<{ total_hours: number }>>`
                SELECT COALESCE(SUM(meeting_hours), 0) as total_hours
                FROM (
                    SELECT (MAX(ss."endTimestamp") - MIN(ss."startTimestamp")) / 3600.0 as meeting_hours
                    FROM "CouncilMeeting" cm
                    JOIN "SpeakerSegment" ss ON ss."meetingId" = cm.id AND ss."cityId" = cm."cityId"
                    ${realmJoin}
                    WHERE cm.released = true
                    GROUP BY cm.id, cm."cityId"
                ) meetings
            `
        ])

        const totalHours = Number(meetingDurations[0]?.total_hours ?? 0)

        return {
            municipalityCount,
            subjectCount,
            meetingHours: Math.round(totalHours)
        }
    } catch (error) {
        console.error('Error fetching about page stats:', error)
        throw new Error('Failed to fetch about page stats')
    }
}
