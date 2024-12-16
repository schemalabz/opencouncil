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
export type OfferSupersededBy = {
    oldId: Offer['id'];
    newId: Offer['id'];
}

export async function getOffer(id: string): Promise<Offer | OfferSupersededBy | null> {
    try {
        const offer = await prisma.offer.findUnique({
            where: { id },
        });

        if (!offer) {
            return null;
        }

        // If this offer has a cityId, check for more recent offers for the same city
        if (offer.cityId) {
            const newerOffer = await prisma.offer.findFirst({
                where: {
                    cityId: offer.cityId,
                    createdAt: {
                        gt: offer.createdAt
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            if (newerOffer) {
                return {
                    oldId: offer.id,
                    newId: newerOffer.id
                };
            }
        }

        return offer;
    } catch (error) {
        console.error('Error fetching offer:', error);
        throw new Error('Failed to fetch offer');
    }
}

export async function getOffers(): Promise<Offer[]> {
    withUserAuthorizedToEdit({});
    try {
        const offers = await prisma.offer.findMany();
        return offers;
    } catch (error) {
        console.error('Error fetching offers:', error);
        throw new Error('Failed to fetch offers');
    }
}