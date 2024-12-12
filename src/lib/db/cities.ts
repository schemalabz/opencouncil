"use server";
import { City, Person, Party, CouncilMeeting } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

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
    withUserAuthorizedToEdit({ root: true });
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

export async function getFullCity(id: string): Promise<City & { councilMeetings: CouncilMeeting[], parties: (Party & { persons: Person[] })[], persons: (Person & { party: Party | null })[] } | null> {
    try {
        const startTime = performance.now();
        const city = await prisma.city.findUnique({
            where: { id },
            include: {
                councilMeetings: {
                    orderBy: { dateTime: 'desc' },
                },
                parties: {
                    include: {
                        persons: true
                    }
                },
                persons: {
                    include: {
                        party: true
                    },
                    orderBy: {
                        name: 'asc'
                    }
                }
            }
        });
        const endTime = performance.now();
        return city;
    } catch (error) {
        console.error('Error fetching city:', error);
        throw new Error('Failed to fetch city');
    }
}

export async function getCities({ includeUnlisted = false }: { includeUnlisted?: boolean } = {}): Promise<(City & { councilMeetings: CouncilMeeting[] })[]> {
    try {
        const cities = await prisma.city.findMany({
            where: {
                isListed: includeUnlisted ? undefined : true
            },
            include: {
                councilMeetings: true
            }
        });
        return cities;
    } catch (error) {
        console.error('Error fetching cities:', error);
        throw new Error('Failed to fetch cities');
    }
}