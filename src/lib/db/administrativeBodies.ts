"use server";
import { AdministrativeBody } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

export async function getAdministrativeBodiesForCity(cityId: string): Promise<AdministrativeBody[]> {
    try {
        const administrativeBodies = await prisma.administrativeBody.findMany({
            where: { cityId },
            orderBy: [
                { type: 'asc' },
                { name: 'asc' },
            ],
        });
        return administrativeBodies;
    } catch (error) {
        console.error('Error fetching administrative bodies:', error);
        throw new Error('Failed to fetch administrative bodies');
    }
}

export async function createAdministrativeBody(bodyData: Omit<AdministrativeBody, 'id' | 'createdAt' | 'updatedAt'>): Promise<AdministrativeBody> {
    await withUserAuthorizedToEdit({ cityId: bodyData.cityId });
    try {
        const newBody = await prisma.administrativeBody.create({
            data: bodyData,
        });
        return newBody;
    } catch (error) {
        console.error('Error creating administrative body:', error);
        throw new Error('Failed to create administrative body');
    }
}

export async function editAdministrativeBody(
    id: string,
    bodyData: Partial<Omit<AdministrativeBody, 'id' | 'cityId' | 'createdAt' | 'updatedAt'>>
): Promise<AdministrativeBody> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new Error('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId });
    try {
        const updatedBody = await prisma.administrativeBody.update({
            where: { id },
            data: bodyData,
        });
        return updatedBody;
    } catch (error) {
        console.error('Error editing administrative body:', error);
        throw new Error('Failed to edit administrative body');
    }
}

export async function deleteAdministrativeBody(id: string): Promise<void> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new Error('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId });
    try {
        await prisma.administrativeBody.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting administrative body:', error);
        throw new Error('Failed to delete administrative body');
    }
} 