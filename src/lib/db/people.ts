"use server";
import { Person, Party, Role, AdministrativeBody, City, VoicePrint } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

export type PersonWithRelations = Person & {
    roles: (Role & {
        party?: Party | null;
        city?: City | null;
        administrativeBody?: AdministrativeBody | null;
    })[];
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
                        endDate: role.endDate
                    }))
                }
            },
            include: {
                roles: {
                    include: {
                        party: true,
                        city: true,
                        administrativeBody: true
                    }
                }
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
                            endDate: role.endDate
                        }))
                    }
                },
                include: {
                    roles: {
                        include: {
                            party: true,
                            city: true,
                            administrativeBody: true
                        }
                    }
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
                roles: {
                    include: {
                        party: true,
                        city: true,
                        administrativeBody: true
                    }
                },
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
                        OR: [
                            // Both dates null
                            { startDate: null, endDate: null },
                            // Only start date set - active if in past
                            { startDate: { lte: now }, endDate: null },
                            // Only end date set - active if in future
                            { startDate: null, endDate: { gt: now } },
                            // Both dates set - active if current time is within range
                            {
                                startDate: { lte: now },
                                endDate: { gt: now }
                            }
                        ]
                    } : undefined,
                    include: {
                        party: true,
                        city: true,
                        administrativeBody: true
                    }
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
