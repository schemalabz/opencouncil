"use server";
import { PrismaClient, City } from '@prisma/client';

const prisma = new PrismaClient();

export async function deleteCity(id: string): Promise<void> {
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

export async function getCities(): Promise<City[]> {
    try {
        const cities = await prisma.city.findMany();
        return cities;
    } catch (error) {
        console.error('Error fetching cities:', error);
        throw new Error('Failed to fetch cities');
    }
}