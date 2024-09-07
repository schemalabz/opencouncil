"use server";
import { Party, Person } from '@prisma/client';
import prisma from "./prisma";

export async function deleteParty(id: string): Promise<void> {
    try {
        await prisma.party.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting party:', error);
        throw new Error('Failed to delete party');
    }
}

export async function createParty(partyData: Omit<Party, 'id' | 'createdAt' | 'updatedAt'>): Promise<Party> {
    try {
        const newParty = await prisma.party.create({
            data: partyData,
        });
        return newParty;
    } catch (error) {
        console.error('Error creating party:', error);
        throw new Error('Failed to create party');
    }
}

export async function editParty(id: string, partyData: Partial<Omit<Party, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Party> {
    try {
        const updatedParty = await prisma.party.update({
            where: { id },
            data: partyData,
        });
        return updatedParty;
    } catch (error) {
        console.error('Error editing party:', error);
        throw new Error('Failed to edit party');
    }
}

export async function getParty(id: string): Promise<(Party & { persons: Person[] }) | null> {
    try {
        const party = await prisma.party.findUnique({
            where: { id },
            include: {
                persons: true,
            }
        });
        return party as Party & { persons: Person[] } | null;
    } catch (error) {
        console.error('Error fetching party:', error);
        throw new Error('Failed to fetch party');
    }
}


export async function getPartiesForCity(cityId: string): Promise<(Party & { persons: Person[] })[]> {
    try {
        const parties = await prisma.party.findMany({
            where: { cityId },
            include: {
                persons: true,
            }
        });
        return parties;
    } catch (error) {
        console.error('Error fetching parties for city:', error);
        throw new Error('Failed to fetch parties for city');
    }
}