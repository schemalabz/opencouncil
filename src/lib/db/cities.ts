"use server";
import { City, Person, Party, CouncilMeeting, Subject, Topic, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { SubjectWithRelations } from './subject';
import { LandingPageCity } from './landing';

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

export async function getCity(id: string): Promise<City | null> {
    try {
        const city = await prisma.city.findUnique({
            where: { id },
        });
        return city;
    } catch (error) {
        console.error('Error fetching city:', error);
        throw new Error('Failed to fetch city');
    }
}

export async function getFullCity(cityId: string) {
    return await prisma.city.findUnique({
        where: { id: cityId },
        include: {
            councilMeetings: {
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
                            topic: true
                        }
                    }
                }
            },
            parties: {
                include: {
                    persons: true
                }
            },
            persons: {
                include: {
                    party: true,
                    speakerTags: true
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

export async function getCities({ includeUnlisted = false, includePending = false }: { includeUnlisted?: boolean, includePending?: boolean } = {}): Promise<(City & { councilMeetings: CouncilMeeting[] })[]> {
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
                councilMeetings: true,
            }
        });
        return cities;
    } catch (error) {
        console.error('Error fetching cities:', error);
        throw new Error('Failed to fetch cities');
    }
}

export async function getCitiesWithGeometry(cities: City[]): Promise<(City & { geometry: any })[]> {
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
