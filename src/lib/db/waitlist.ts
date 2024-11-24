"use server";
import prisma from "./prisma";

export async function addToWaitlist(email: string, municipalityIds: string): Promise<void> {
    try {
        await prisma.waitlist.create({
            data: {
                email,
                municipalityIds
            }
        });
    } catch (error) {
        console.error('Error adding to waitlist:', error);
        throw new Error('Failed to add to waitlist');
    }
}

export async function getWaitlistEntry(email: string) {
    try {
        const entry = await prisma.waitlist.findFirst({
            where: { email }
        });
        return entry;
    } catch (error) {
        console.error('Error fetching waitlist entry:', error);
        throw new Error('Failed to fetch waitlist entry');
    }
}
