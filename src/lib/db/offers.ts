"use server";
import { Offer } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

export async function createOffer(offerData: Omit<Offer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Offer> {
    withUserAuthorizedToEdit({});
    try {
        const newOffer = await prisma.offer.create({
            data: offerData,
        });
        return newOffer;
    } catch (error) {
        console.error('Error creating offer:', error);
        throw new Error('Failed to create offer');
    }
}

export async function updateOffer(id: string, offerData: Partial<Omit<Offer, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Offer> {
    withUserAuthorizedToEdit({});
    try {
        const updatedOffer = await prisma.offer.update({
            where: { id },
            data: offerData,
        });
        return updatedOffer;
    } catch (error) {
        console.error('Error updating offer:', error);
        throw new Error('Failed to update offer');
    }
}

export async function deleteOffer(id: string): Promise<void> {
    withUserAuthorizedToEdit({});
    try {
        await prisma.offer.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting offer:', error);
        throw new Error('Failed to delete offer');
    }
}

export async function getOffer(id: string): Promise<Offer | null> {
    try {
        const offer = await prisma.offer.findUnique({
            where: { id },
        });
        return offer;
    } catch (error) {
        console.error('Error fetching offer:', error);
        throw new Error('Failed to fetch offer');
    }
}
