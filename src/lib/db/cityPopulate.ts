// Server-only: populateCity takes no identity and checks no session. The
// caller authorizes first — the populate API route and the MCP admin tools do.
import "server-only";
import { z } from 'zod';
import { AdministrativeBodyType } from '@prisma/client';
import prisma from './prisma';
import { canUseCityCreator, getCity } from './cities';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';

// Zod schema for city JSON validation
export const cityPopulationSchema = z.object({
    cityId: z.string(),
    parties: z.array(z.object({
        name: z.string(),
        name_en: z.string(),
        name_short: z.string(),
        name_short_en: z.string(),
        colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        logo: z.string().nullable().optional(),
    })),
    administrativeBodies: z.array(z.object({
        name: z.string(),
        name_en: z.string(),
        type: z.enum(['council', 'committee', 'community']),
    })),
    people: z.array(z.object({
        name: z.string(),
        name_en: z.string(),
        name_short: z.string(),
        name_short_en: z.string(),
        image: z.string().nullable().optional(),
        activeFrom: z.string().nullable().optional(),
        activeTo: z.string().nullable().optional(),
        profileUrl: z.string().nullable().optional(),
        partyName: z.string().nullable().optional(),
        roles: z.array(z.object({
            type: z.enum(['party', 'city', 'adminBody']),
            name: z.union([z.string(), z.null()]).transform(val => (typeof val === 'string' && val.trim()) || null).optional(),
            name_en: z.union([z.string(), z.null()]).transform(val => (typeof val === 'string' && val.trim()) || null).optional(),
            isHead: z.boolean().optional(),
            partyName: z.string().nullable().optional(),
            administrativeBodyName: z.string().nullable().optional(),
        })).optional(),
    })),
});

export type CityPopulationData = z.infer<typeof cityPopulationSchema>;

export type CityPopulationStats = {
    partiesCount: number;
    peopleCount: number;
    rolesCount: number;
    adminBodiesCount: number;
};

/**
 * The City Creator only runs on a city that has no parties, people, roles or
 * meetings. This is the early answer a route gives before it reads a body;
 * populateCity decides again under a lock, and that decision is the one that
 * holds.
 */
export async function requireEmptyCity(cityId: string): Promise<void> {
    if (await canUseCityCreator(cityId)) return;
    if (!(await getCity(cityId))) throw new NotFoundError('City not found');
    throw new BadRequestError('City already has data');
}

/**
 * Save the parties, administrative bodies, people and roles of an empty city.
 *
 * The emptiness check runs inside the transaction, after a lock on the city
 * row. Two calls for the same city — a retry, or two administrators — then
 * serialize on that lock, and the second one sees what the first wrote. A
 * check before the transaction, as requireEmptyCity offers, would let both
 * pass and the city would hold its council twice.
 */
export async function populateCity(cityId: string, validatedData: CityPopulationData): Promise<CityPopulationStats> {
    // Save all data in a single transaction
    return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "City" WHERE id = ${cityId} FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundError('City not found');

        const existingRows = await Promise.all([
            tx.party.count({ where: { cityId } }),
            tx.person.count({ where: { cityId } }),
            tx.councilMeeting.count({ where: { cityId } }),
            tx.role.count({ where: { cityId } }),
        ]);
        if (existingRows.some(count => count > 0)) throw new BadRequestError('City already has data');

        // Create administrative bodies
        const adminBodies = await Promise.all(
            validatedData.administrativeBodies.map(adminBody =>
                tx.administrativeBody.create({
                    data: {
                        name: adminBody.name,
                        name_en: adminBody.name_en,
                        type: adminBody.type as AdministrativeBodyType,
                        cityId: cityId,
                    },
                })
            )
        );

        // Create parties
        const parties = await Promise.all(
            validatedData.parties.map(party =>
                tx.party.create({
                    data: {
                        name: party.name,
                        name_en: party.name_en,
                        name_short: party.name_short,
                        name_short_en: party.name_short_en,
                        colorHex: party.colorHex,
                        logo: party.logo,
                        cityId: cityId,
                    },
                })
            )
        );

        // Create people
        const people = await Promise.all(
            validatedData.people.map(person =>
                tx.person.create({
                    data: {
                        name: person.name,
                        name_en: person.name_en,
                        name_short: person.name_short,
                        name_short_en: person.name_short_en,
                        image: person.image,
                        activeFrom: person.activeFrom ? new Date(person.activeFrom) : null,
                        activeTo: person.activeTo ? new Date(person.activeTo) : null,
                        profileUrl: person.profileUrl,
                        cityId: cityId
                    },
                })
            )
        );

        // Create roles from people data
        await Promise.all(
            validatedData.people.flatMap((personData, personIndex) => {
                const person = people[personIndex];
                if (!personData.roles) return [];

                return personData.roles.map(role => {
                    const party = role.partyName
                        ? parties.find(p => p.name === role.partyName)
                        : null;

                    const adminBody = role.administrativeBodyName
                        ? adminBodies.find(ab => ab.name === role.administrativeBodyName)
                        : null;

                    return tx.role.create({
                        data: {
                            personId: person.id,
                            name: role.name,
                            name_en: role.name_en,
                            isHead: role.isHead || false,
                            startDate: null,
                            endDate: null,
                            cityId: role.type === 'city' ? cityId : null,
                            partyId: role.type === 'party' ? party?.id : null,
                            administrativeBodyId: role.type === 'adminBody' ? adminBody?.id : null,
                        },
                    });
                });
            })
        );

        // Importing data does not publish the city — a superadmin promotes it to
        // demo or supported once the import has been checked. Written explicitly
        // rather than left alone because the City Creator also runs on cities that
        // already have a status.
        await tx.city.update({
            where: { id: cityId },
            data: { status: 'pending' },
        });

        const totalRoles = validatedData.people.reduce((count, person) => count + (person.roles?.length || 0), 0);

        return {
            partiesCount: parties.length,
            peopleCount: people.length,
            rolesCount: totalRoles,
            adminBodiesCount: adminBodies.length,
        };
    }, {
        // A full council (a large city can have 60+ members, each with several
        // roles) is hundreds of sequential inserts; against a remote DB that
        // overruns Prisma's default 5s interactive-transaction timeout.
        maxWait: 10_000,
        timeout: 60_000,
    });
}
