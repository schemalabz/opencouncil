"use server";
import { Person, Party } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

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

export async function createPerson(personData: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>): Promise<Person> {
    withUserAuthorizedToEdit({ cityId: personData.cityId });
    try {
        const newPerson = await prisma.person.create({
            data: personData,
        });
        return newPerson;
    } catch (error) {
        console.error('Error creating person:', error);
        throw new Error('Failed to create person');
    }
}

export async function editPerson(id: string, personData: Partial<Omit<Person, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Person> {
    withUserAuthorizedToEdit({ personId: id });
    try {
        // Convert empty partyId to null
        if (personData.partyId === '') {
            personData.partyId = null;
        }

        const updatedPerson = await prisma.person.update({
            where: { id },
            data: personData,
        });
        return updatedPerson;
    } catch (error) {
        console.error('Error editing person:', error);
        throw new Error('Failed to edit person');
    }
}

export async function getPerson(id: string): Promise<(Person & { party: Party | null }) | null> {
    try {
        const person = await prisma.person.findUnique({
            where: { id },
            include: {
                party: true,
            }
        });
        return person;
    } catch (error) {
        console.error('Error fetching person:', error);
        throw new Error('Failed to fetch person');
    }
}

export async function getPeopleForCity(cityId: string): Promise<(Person & { party: Party | null })[]> {
    try {
        const people = await prisma.person.findMany({
            where: { cityId },
            include: {
                party: true,
            }
        });
        return people.sort(() => Math.random() - 0.5);
    } catch (error) {
        console.error('Error fetching people for city:', error);
        throw new Error('Failed to fetch people for city');
    }
} 
