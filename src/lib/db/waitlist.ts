"use server";
import { withUserAuthorizedToEdit } from "../auth";
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
    withUserAuthorizedToEdit({});
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

export async function getWaitlistEntries() {
    withUserAuthorizedToEdit({});
    try {
        const entries = await prisma.waitlist.findMany();
        return entries;
    } catch (error) {
        console.error('Error fetching all waitlist entries:', error);
        throw new Error('Failed to fetch all waitlist entries');
    }
}

export async function deleteWaitlistEntry(id: string) {
    withUserAuthorizedToEdit({});
    try {
        await prisma.waitlist.delete({ where: { id } });
    } catch (error) {
        console.error('Error deleting waitlist entry:', error);
        throw new Error('Failed to delete waitlist entry');
    }
}