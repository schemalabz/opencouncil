"use server";
import { City, CouncilMeeting, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit, getCurrentUser } from "../auth";

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

export type CityMinimalWithCounts = Pick<City, 'id' | 'name' | 'name_en' | 'name_municipality' | 'name_municipality_en' | 'logoImage' | 'supportsNotifications' | 'isPending' | 'isListed' | 'officialSupport' | 'authorityType'> & {
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
    { isListed: 'desc' as const },
    { name: 'asc' as const }
];

export async function deleteCity(id: string): Promise<void> {
    withUserAuthorizedToEdit({ cityId: id });
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
    withUserAuthorizedToEdit({});
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
    withUserAuthorizedToEdit({ cityId: id });
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

export async function getCity(id: string): Promise<CityWithCounts | null> {
    try {
        const city = await prisma.city.findUnique({
            where: { id },
            include: {
                _count: CITY_COUNT_SELECT
            }
        });
        return city;
    } catch (error) {
        console.error('Error fetching city:', error);
        throw new Error('Failed to fetch city');
    }
}

export async function getFullCity(cityId: string) {
    const canEdit = await isUserAuthorizedToEdit({ cityId });
    return await prisma.city.findUnique({
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
                                    party: true,
                                    roles: true
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
                    party: true,
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
}

export async function getAllCitiesMinimal(): Promise<CityMinimalWithCounts[]> {
    try {
        const cities = await prisma.city.findMany({
            select: {
                id: true,
                name: true,
                name_en: true,
                name_municipality: true,
                name_municipality_en: true,
                logoImage: true,
                supportsNotifications: true,
                isPending: true,
                authorityType: true,
                isListed: true,
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
 * Retrieves cities based on user permissions and city status.
 */
export async function getCities({ includeUnlisted = false, includePending = false }: { includeUnlisted?: boolean, includePending?: boolean } = {}): Promise<CityWithCounts[]> {    
    // Get current user for authorization
    const currentUser = includeUnlisted ? await getCurrentUser() : null;
    
    // Validate permissions
    if (includeUnlisted && !currentUser) {
        throw new Error("Not authorized to view unlisted cities");
    }
    
    // Build where clause based on user permissions
    let whereClause: any = {
        // In Prisma, undefined means "ignore this condition entirely"
        // So we can use it to conditionally include or exclude pending cities
        isPending: includePending ? undefined : false
    };
    
    if (!includeUnlisted) {
        // Public mode: only show listed cities
        whereClause.isListed = true;
    } else if (!currentUser?.isSuperAdmin) {
        // Authenticated user mode: show listed cities + cities they can administer
        const administerableCityIds = currentUser?.administers
            .filter(a => a.cityId)
            .map(a => a.cityId) || [];
            
        whereClause = {
            ...whereClause,
            OR: [
                { isListed: true },
                {
                    isListed: false,
                    id: { in: administerableCityIds }
                }
            ]
        };
    }
    // Superadmin mode: show all cities (no additional filter needed beyond isPending)
    
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

export async function getCitiesWithCouncilMeetings({ includeUnlisted = false, includePending = false }: { includeUnlisted?: boolean, includePending?: boolean } = {}): Promise<CityWithCouncilMeeting[]> {
    if (includeUnlisted) {
        withUserAuthorizedToEdit({});
    }

    try {
        const cities = await prisma.city.findMany({
            where: {
                isPending: includePending ? undefined : false,
                isListed: (includeUnlisted || includePending) ? undefined : true
            },
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

export async function getCitiesWithGeometry<T extends City>(cities: T[]): Promise<(T & { geometry: GeoJSON.Geometry | null })[]> {
    if (cities.length === 0) return [];

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
