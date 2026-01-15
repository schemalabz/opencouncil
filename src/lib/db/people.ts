"use server";
import { Person, Role, VoicePrint } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { getActiveRoleCondition } from "../utils";
import { RoleWithRelations, roleWithRelationsInclude } from "./types";

export type PersonWithRelations = Person & {
    roles: RoleWithRelations[];
    voicePrints?: VoicePrint[];
};

export async function deletePerson(id: string): Promise<void> {
    await withUserAuthorizedToEdit({ personId: id });
    try {
        await prisma.person.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting person:', error);
        throw new Error('Failed to delete person');
    }
}

export async function createPerson(data: {
    cityId: string;
    name: string;
    name_en: string;
    name_short: string;
    name_short_en: string;
    image: string | null;
    profileUrl: string | null;
    roles: Role[];
}): Promise<Person> {
    await withUserAuthorizedToEdit({ cityId: data.cityId });
    try {
        const newPerson = await prisma.person.create({
            data: {
                cityId: data.cityId,
                name: data.name,
                name_en: data.name_en,
                name_short: data.name_short,
                name_short_en: data.name_short_en,
                image: data.image,
                profileUrl: data.profileUrl,
                roles: {
                    create: data.roles.map(role => ({
                        cityId: role.cityId,
                        partyId: role.partyId,
                        administrativeBodyId: role.administrativeBodyId,
                        name: role.name,
                        name_en: role.name_en,
                        isHead: role.isHead,
                        startDate: role.startDate,
                        endDate: role.endDate,
                        rank: role.rank
                    }))
                }
            },
            include: {
                roles: roleWithRelationsInclude
            }
        });
        return newPerson;
    } catch (error) {
        console.error('Error creating person:', error);
        throw new Error('Failed to create person');
    }
}

export async function editPerson(id: string, data: {
    name: string;
    name_en: string;
    name_short: string;
    name_short_en: string;
    image?: string;
    profileUrl: string | null;
    roles: Role[];
}): Promise<Person> {
    await withUserAuthorizedToEdit({ personId: id });
    try {
        const updatedPerson = await prisma.$transaction(async (tx) => {
            // First delete all existing roles
            await tx.role.deleteMany({
                where: { personId: id }
            });

            // Then update the person and create new roles
            return await tx.person.update({
                where: { id },
                data: {
                    name: data.name,
                    name_en: data.name_en,
                    name_short: data.name_short,
                    name_short_en: data.name_short_en,
                    ...(data.image && { image: data.image }),
                    profileUrl: data.profileUrl,
                    roles: {
                        create: data.roles.map(role => ({
                            cityId: role.cityId,
                            partyId: role.partyId,
                            administrativeBodyId: role.administrativeBodyId,
                            name: role.name,
                            name_en: role.name_en,
                            isHead: role.isHead,
                            startDate: role.startDate,
                            endDate: role.endDate,
                            rank: role.rank
                        }))
                    }
                },
                include: {
                    roles: roleWithRelationsInclude
                }
            });
        });
        return updatedPerson;
    } catch (error) {
        console.error('Error editing person:', error);
        throw new Error('Failed to edit person');
    }
}

export async function getPerson(id: string): Promise<PersonWithRelations | null> {
    try {
        const person = await prisma.person.findUnique({
            where: { id },
            include: {
                roles: roleWithRelationsInclude,
                voicePrints: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1 // Only get the most recent voiceprint
                }
            }
        });
        return person;
    } catch (error) {
        console.error('Error fetching person:', error);
        throw new Error('Failed to fetch person');
    }
}

export async function getPeopleForCity(cityId: string, activeRolesOnly: boolean = false): Promise<PersonWithRelations[]> {
    try {
        const now = new Date();
        const people = await prisma.person.findMany({
            where: { cityId },
            include: {
                roles: {
                    where: activeRolesOnly ? {
                        OR: getActiveRoleCondition(now)
                    } : undefined,
                    ...roleWithRelationsInclude
                },
                voicePrints: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1 // Only get the most recent voiceprint
                }
            }
        });
        return people.sort(() => Math.random() - 0.5);
    } catch (error) {
        console.error('Error fetching people for city:', error);
        throw new Error('Failed to fetch people for city');
    }
}

/**
 * Get relevant people for a meeting based on its administrative body type.
 * This filters people to avoid AI confusion by only including relevant members.
 *
 * Rules:
 * - Council meetings (type=council): All council members + people with no admin body + community heads
 * - Committee meetings (type=committee): Only members of that specific committee
 * - Community meetings (type=community): Only members of that specific community
 * - No admin body: All people in the city
 */
export async function getPeopleForMeeting(cityId: string, administrativeBodyId: string | null): Promise<PersonWithRelations[]> {
    const allPeople = await getPeopleForCity(cityId);

    // If no administrative body, return all people
    if (!administrativeBodyId) {
        return allPeople;
    }

    // Get the administrative body to check its type
    const adminBody = await prisma.administrativeBody.findUnique({
        where: { id: administrativeBodyId }
    });

    if (!adminBody) {
        // If admin body not found, return all people as fallback
        console.warn(`Administrative body ${administrativeBodyId} not found, returning all people`);
        return allPeople;
    }

    // Filter based on administrative body type
    if (adminBody.type === 'council') {
        // Council meetings: Include council members, people with no admin body, and community heads
        return allPeople.filter(person => {
            const hasCouncilRole = person.roles.some(
                role => role.administrativeBodyId === administrativeBodyId
            );
            const hasNoAdminBody = !person.roles.some(
                role => role.administrativeBody
            );
            const isCommunityHead = person.roles.some(
                role => role.administrativeBody?.type === 'community' && role.isHead
            );

            return hasCouncilRole || hasNoAdminBody || isCommunityHead;
        });
    } else if (adminBody.type === 'committee') {
        // Committee meetings: Only members of this specific committee
        return allPeople.filter(person =>
            person.roles.some(role => role.administrativeBodyId === administrativeBodyId)
        );
    } else if (adminBody.type === 'community') {
        // Community meetings: Only members of this specific community
        return allPeople.filter(person =>
            person.roles.some(role => role.administrativeBodyId === administrativeBodyId)
        );
    }

    // Fallback: return all people
    return allPeople;
} 
