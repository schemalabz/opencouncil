"use server";
import { Person, VoicePrint } from '@prisma/client';
import type { PersonRoleOutput } from '@/lib/zod-schemas/person';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { getActiveRoleCondition, hasCityLevelRole, getRoleTypePriority } from "../utils";
import { RoleWithRelations, roleWithRelationsInclude } from "./types";

export type PersonWithRelations = Person & {
    roles: RoleWithRelations[];
};

// Voiceprints are biometric data. Only expose them through
// getPeopleWithVoicePrintsForCity, which checks authorization.
export type PersonWithVoicePrints = PersonWithRelations & {
    voicePrints: VoicePrint[];
    /** `administrators` counts the accounts that manage the person. */
    _count: { administrators: number };
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
    roles: PersonRoleOutput[];
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
                        electedOrder: role.electedOrder
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
    image?: string | null;
    profileUrl: string | null;
    roles: PersonRoleOutput[];
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
                    ...(data.image !== undefined && { image: data.image }),
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
                            electedOrder: role.electedOrder
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
                roles: roleWithRelationsInclude
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
                }
            }
        });
        return people.sort(() => Math.random() - 0.5);
    } catch (error) {
        console.error('Error fetching people for city:', error);
        throw new Error('Failed to fetch people for city');
    }
}

export async function getPeopleWithVoicePrintsForCity(cityId: string): Promise<PersonWithVoicePrints[]> {
    await withUserAuthorizedToEdit({ cityId });
    try {
        const people = await prisma.person.findMany({
            where: { cityId },
            include: {
                roles: roleWithRelationsInclude,
                voicePrints: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1 // Only get the most recent voiceprint
                },
                _count: { select: { administrators: true } }
            }
        });
        return people;
    } catch (error) {
        console.error('Error fetching people with voiceprints for city:', error);
        throw new Error('Failed to fetch people with voiceprints for city');
    }
}

/**
 * Whether a person may speak at a meeting of the given administrative body.
 * One rule for every kind of body:
 * - the members of the body that is meeting;
 * - the municipal council;
 * - the holders of a city-level role (mayor, deputy mayors, general secretary);
 * - the heads of the communities;
 * - people with no administrative body.
 *
 * Officials and councillors from outside the body attend and speak, at a
 * committee as much as at the council. The rest of the city does not: most of
 * it is ordinary members of community councils.
 *
 * Only city-level roles are read on the meeting date. Membership counts
 * whenever it was held: people go on speaking after the role's recorded end,
 * and on 53 reviewed meetings a date check would have dropped about one person
 * from a list and left out two who spoke.
 */
function maySpeakAtMeeting(person: PersonWithRelations, administrativeBodyId: string, date?: Date): boolean {
    if (hasCityLevelRole(person.roles, date)) {
        return true;
    }
    const isInMeetingBody = person.roles.some(role => role.administrativeBodyId === administrativeBodyId);
    const isInCouncil = person.roles.some(role => role.administrativeBody?.type === 'council');
    const isCommunityHead = person.roles.some(role => role.administrativeBody?.type === 'community' && role.isHead);
    const hasNoAdminBody = !person.roles.some(role => role.administrativeBody);

    return isInMeetingBody || isInCouncil || isCommunityHead || hasNoAdminBody;
}

/**
 * The people who may speak at a meeting (see maySpeakAtMeeting): whose
 * voiceprints transcribe matches against, and who the transcript tasks are told
 * about. A meeting with no administrative body gets all people in the city.
 *
 * `date` is the day city-level roles are read on; today when left out.
 */
export async function getPeopleWhoMaySpeak(cityId: string, administrativeBodyId: string | null, date?: Date): Promise<PersonWithRelations[]> {
    const allPeople = await getPeopleForCity(cityId);
    if (!administrativeBodyId) {
        return allPeople;
    }
    return allPeople.filter(person => maySpeakAtMeeting(person, administrativeBodyId, date));
}

/**
 * Get relevant people for a meeting based on its administrative body type.
 * This filters people to avoid AI confusion by only including relevant members.
 * It serves the tasks that read documents (the agenda, the decisions). The tasks
 * that hear the meeting use getPeopleWhoMaySpeak.
 *
 * Rules:
 * - Council meetings (type=council): everyone who may speak there (see maySpeakAtMeeting)
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
        // Council meetings: Include council members, people with no admin body, community heads, and mayors
        // Sort by role priority so the most important members come first
        const filtered = allPeople.filter(person => maySpeakAtMeeting(person, administrativeBodyId));

        return filtered.sort((a, b) => {
            const bestRoleA = Math.min(...a.roles.map(getRoleTypePriority));
            const bestRoleB = Math.min(...b.roles.map(getRoleTypePriority));
            return bestRoleA - bestRoleB;
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
