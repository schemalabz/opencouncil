"use server";
import { Person, Party, Role } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { PersonWithRelations } from '../getMeetingData';

export async function deletePerson(id: string): Promise<void> {
    withUserAuthorizedToEdit({ personId: id });
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
    withUserAuthorizedToEdit({ cityId: data.cityId });
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
    withUserAuthorizedToEdit({ personId: id });
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
                }
            }
        });
        return person;
    } catch (error) {
        console.error('Error fetching person:', error);
        throw new Error('Failed to fetch person');
    }
}

export async function getPeopleForCity(cityId: string): Promise<PersonWithRelations[]> {
    try {
        const people = await prisma.person.findMany({
            where: { cityId },
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
        return people.sort(() => Math.random() - 0.5);
    } catch (error) {
        console.error('Error fetching people for city:', error);
        throw new Error('Failed to fetch people for city');
    }
} 
