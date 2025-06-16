"use server";
import { CityMessage } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

export async function getCityMessage(cityId: string): Promise<CityMessage | null> {
    try {
        const message = await prisma.cityMessage.findUnique({
            where: { cityId }
        });
        return message;
    } catch (error) {
        console.error('Error fetching city message:', error);
        throw new Error('Failed to fetch city message');
    }
}

export async function upsertCityMessage(
    cityId: string, 
    messageData: Omit<CityMessage, 'id' | 'cityId' | 'createdAt' | 'updatedAt'>
): Promise<CityMessage> {
    withUserAuthorizedToEdit({ cityId });
    try {
        const message = await prisma.cityMessage.upsert({
            where: { cityId },
            update: messageData,
            create: {
                ...messageData,
                cityId
            }
        });
        return message;
    } catch (error) {
        console.error('Error upserting city message:', error);
        throw new Error('Failed to upsert city message');
    }
}

export async function deleteCityMessage(cityId: string): Promise<void> {
    withUserAuthorizedToEdit({ cityId });
    try {
        await prisma.cityMessage.delete({
            where: { cityId }
        });
    } catch (error) {
        console.error('Error deleting city message:', error);
        throw new Error('Failed to delete city message');
    }
} 