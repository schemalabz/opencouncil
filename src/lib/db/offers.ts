"use server";
import { Offer } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { validateAdam } from "../zod-schemas/offer";
import { isSigned } from "../offers/state";

export async function createOffer(offerData: Omit<Offer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Offer> {
    await withUserAuthorizedToEdit({});
    validateAdam(offerData.adam);
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
    await withUserAuthorizedToEdit({});
    if ('adam' in offerData) validateAdam(offerData.adam);
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
    await withUserAuthorizedToEdit({});
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

        // Supersession only applies between *pending* offers for the same city.
        // Once an offer is signed (agreed or has ΑΔΑΜ), it's a permanent record;
        // newer offers for the same city are renewals, not supersessions.
        if (offer.cityId && !isSigned(offer)) {
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

            if (newerOffer && !isSigned(newerOffer)) {
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
    await withUserAuthorizedToEdit({});
    try {
        const offers = await prisma.offer.findMany();
        return offers;
    } catch (error) {
        console.error('Error fetching offers:', error);
        throw new Error('Failed to fetch offers');
    }
}