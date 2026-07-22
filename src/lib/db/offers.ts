"use server";
import { Offer } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { validateAdam } from "../zod-schemas/offer";
import { isSigned, getSupersedingOffer } from "../offers/state";

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

        // Signed offers (agreed or with ΑΔΑΜ) are permanent records and never
        // redirect. Pending offers redirect to their superseder — see
        // getSupersedingOffer for the exact semantics (period overlap matters).
        if (offer.cityId && !isSigned(offer)) {
            const cityOffers = await prisma.offer.findMany({
                where: { cityId: offer.cityId },
            });

            const superseder = getSupersedingOffer(offer, cityOffers);
            if (superseder) {
                return {
                    oldId: offer.id,
                    newId: superseder.id
                };
            }
        }

        return offer;
    } catch (error) {
        console.error('Error fetching offer:', error);
        throw new Error('Failed to fetch offer');
    }
}

/**
 * ΑΔΑΜ of the currently in-effect signed contract per city, for cities that
 * have one. Public — ΑΔΑΜ identifiers are published on ΚΗΜΔΗΣ anyway. When
 * several contracts cover today, the most recently started one wins.
 */
export async function getActiveContractAdamByCity(): Promise<Record<string, string>> {
    const now = new Date();
    // End dates are stored at midnight — a contract is still in effect on its
    // final day, so include offers whose endDate is today or later.
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const offers = await prisma.offer.findMany({
        where: {
            adam: { not: null },
            cityId: { not: null },
            startDate: { lte: now },
            endDate: { gte: startOfToday },
        },
        select: { cityId: true, adam: true },
        orderBy: { startDate: "desc" },
    });

    const adamByCity: Record<string, string> = {};
    for (const offer of offers) {
        if (offer.cityId && offer.adam && !(offer.cityId in adamByCity)) {
            adamByCity[offer.cityId] = offer.adam;
        }
    }
    return adamByCity;
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