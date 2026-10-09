"use server";
import { Person, VoicePrint } from '@prisma/client';
import type { PersonRoleData } from '@/lib/zod-schemas/person';
import prisma from "./prisma";
import { withUserAuthorizedToEdit, getRoleLimitForCity } from "@/lib/auth";
import { getActiveRoleCondition, hasCityLevelRole, getRoleTypePriority } from "../utils";
import { validateRolesForBodyAdmin } from "@/lib/utils/roles";
import { isSecondaryBody } from "@/lib/utils/bodyTier";
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
    roles: PersonRoleData[];
}): Promise<Person> {
    await withRolesAuthorized(data.cityId, data.roles);
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

/**
 * The gate on a person's roles. A city admin or a superadmin gives any role.
 * A body admin gives roles on their bodies only, and at least one, with no
 * party and no other city on any of them: the rules of the people routes
 * (validateRolesForBodyAdmin), applied here too, so a direct call of these
 * functions cannot pass what the routes refuse. Anyone else, a person who
 * claimed their own page among them, changes no roles.
 */
async function withRolesAuthorized(cityId: string, roles: PersonRoleData[]): Promise<void> {
    const limit = await getRoleLimitForCity(cityId);
    if (!limit) return;
    const refused = validateRolesForBodyAdmin(roles, limit)
        ?? (roles.some(role => role.cityId && role.cityId !== cityId) ? { error: 'Every role must be in this city.' } : null);
    if (refused) throw new Error(`Not authorized: ${refused.error}`);
}

export async function editPerson(id: string, data: {
    name: string;
    name_en: string;
    name_short: string;
    name_short_en: string;
    image?: string | null;
    profileUrl: string | null;
    /** Replaces every role of the person. Absent, the roles stay as they are. */
    roles?: PersonRoleData[];
}): Promise<Person> {
    await withUserAuthorizedToEdit({ personId: id });
    if (data.roles) {
        const person = await prisma.person.findUnique({ where: { id }, select: { cityId: true } });
        if (!person) throw new Error('Person not found');
        await withRolesAuthorized(person.cityId, data.roles);
    }
    const roles = data.roles;
    try {
        const updatedPerson = await prisma.$transaction(async (tx) => {
            // The roles are replaced as a set: delete them all, then create the new ones.
            if (roles) {
                await tx.role.deleteMany({
                    where: { personId: id }
                });
            }

            return await tx.person.update({
                where: { id },
                data: {
                    name: data.name,
                    name_en: data.name_en,
                    name_short: data.name_short,
                    name_short_en: data.name_short_en,
                    ...(data.image !== undefined && { image: data.image }),
                    profileUrl: data.profileUrl,
                    ...(roles && {
                        roles: {
                            create: roles.map(role => ({
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
                    }),
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

/**
 * Everyone who holds, or held, a role on the body, with all their roles. The
 * page of the body splits them into members and former members by the dates
 * of the role on that body.
 */
export async function getPeopleOfBody(cityId: string, administrativeBodyId: string): Promise<PersonWithRelations[]> {
    return prisma.person.findMany({
        where: { cityId, roles: { some: { administrativeBodyId } } },
        include: { roles: roleWithRelationsInclude },
    });
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
    const isInCouncil = person.roles.some(role => role.administrativeBody?.type === 'council');
    const isCommunityHead = person.roles.some(role => role.administrativeBody?.type === 'community' && role.isHead);
    const hasNoAdminBody = !person.roles.some(role => role.administrativeBody);

    return isMemberOf(person, administrativeBodyId) || isInCouncil || isCommunityHead || hasNoAdminBody;
}

/** Whether a person has held a role on a body, whenever that was (see maySpeakAtMeeting on dates). */
function isMemberOf(person: PersonWithRelations, administrativeBodyId: string): boolean {
    return person.roles.some(role => role.administrativeBodyId === administrativeBodyId);
}

/**
 * The people who may speak at a meeting (see maySpeakAtMeeting): whose
 * voiceprints transcribe matches against, and who the transcript tasks are told
 * about. A meeting with no administrative body gets all people in the city. A
 * meeting of a secondary body gets that body's members and nobody else: the
 * municipality's roster does not sit there.
 *
 * `date` is the day city-level roles are read on; today when left out.
 */
export async function getPeopleWhoMaySpeak(cityId: string, administrativeBodyId: string | null, date?: Date): Promise<PersonWithRelations[]> {
    const allPeople = await getPeopleForCity(cityId);
    if (!administrativeBodyId) {
        return allPeople;
    }
    const body = await prisma.administrativeBody.findUnique({ where: { id: administrativeBodyId }, select: { type: true } });
    if (isSecondaryBody(body)) {
        return allPeople.filter(person => isMemberOf(person, administrativeBodyId));
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
 * - Every other body, primary or secondary: only the members of that body
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
    }

    // A committee, a κοινότητα, a youth council: only the members of that body.
    return allPeople.filter(person => isMemberOf(person, administrativeBodyId));
}
