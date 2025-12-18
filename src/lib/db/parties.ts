"use server";
import { Party, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

const partyWithRolesInclude = {
    roles: {
        include: {
            person: {
                include: {
                    roles: {
                        include: {
                            city: true,
                            administrativeBody: true,
                            party: true
                        }
                    }
                }
            }
        }
    }
} satisfies Prisma.PartyInclude;

type PartyWithRoles = Prisma.PartyGetPayload<{ include: typeof partyWithRolesInclude }>;
export type PersonWithRoles = PartyWithRoles['roles'][number]['person'];

export async function deleteParty(id: string): Promise<void> {
    await withUserAuthorizedToEdit({ partyId: id });
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
    await withUserAuthorizedToEdit({ cityId: partyData.cityId });
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
    await withUserAuthorizedToEdit({ partyId: id });
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

export type PartyWithPersons = Omit<Party, 'roles'> & {
    people: PersonWithRoles[];
}

export async function getParty(id: string): Promise<PartyWithPersons | null> {
    try {
        const party = await prisma.party.findUnique({
            where: { id },
            include: partyWithRolesInclude
        });

        if (!party) return null;

        // Extract people from roles and include all their roles
        // Deduplicate people by id since a person can have multiple roles
        const peopleMap = new Map<string, PersonWithRoles>();
        party.roles.forEach(role => {
            if (!peopleMap.has(role.person.id)) {
                peopleMap.set(role.person.id, role.person);
            }
        });
        const people = Array.from(peopleMap.values());

        // Create a new object without the roles property
        const { roles, ...partyWithoutRoles } = party;

        const partyWithPersons = {
            ...partyWithoutRoles,
            people
        };

        return partyWithPersons;
    } catch (error) {
        console.error('Error fetching party:', error);
        throw new Error('Failed to fetch party');
    }
}

export async function getPartiesForCity(cityId: string): Promise<PartyWithPersons[]> {
    try {
        const parties = await prisma.party.findMany({
            where: { cityId },
            include: {
                roles: {
                    ...partyWithRolesInclude.roles,
                    where: {
                        OR: [
                            // Both dates are null (ongoing role)
                            { startDate: null, endDate: null },
                            // Only start date is set and it's in the past
                            { startDate: { lte: new Date() }, endDate: null },
                            // Only end date is set and it's in the future
                            { startDate: null, endDate: { gt: new Date() } },
                            // Both dates are set and current time is within range
                            {
                                startDate: { lte: new Date() },
                                endDate: { gt: new Date() }
                            }
                        ]
                    }
                }
            }
        });

        // Add people property to each party and remove roles
        // Deduplicate people by id since a person can have multiple roles
        const partiesWithPeople = parties.map(party => {
            const { roles, ...partyWithoutRoles } = party;
            const peopleMap = new Map<string, PersonWithRoles>();
            roles.forEach(role => {
                if (!peopleMap.has(role.person.id)) {
                    peopleMap.set(role.person.id, role.person);
                }
            });
            const people = Array.from(peopleMap.values());
            return {
                ...partyWithoutRoles,
                people
            };
        });

        return partiesWithPeople;
    } catch (error) {
        console.error('Error fetching parties for city:', error);
        throw new Error('Failed to fetch parties for city');
    }
}