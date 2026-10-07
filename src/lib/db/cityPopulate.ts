// Server-only: populateCity takes no identity and checks no session. The
// caller authorizes first — the MCP admin tool populate_city does.
import "server-only";
import { defaultNotificationBehavior } from '@/lib/utils/bodyTier';
import prisma from './prisma';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import type { CityPopulationData } from '@/lib/zod-schemas/cityPopulation';

type CityPopulationStats = {
    partiesCount: number;
    peopleCount: number;
    rolesCount: number;
    adminBodiesCount: number;
};

/**
 * Save the parties, administrative bodies, people and roles of an empty city.
 *
 * The emptiness check runs inside the transaction, after a lock on the city
 * row. Two calls for the same city — a retry, or two administrators — then
 * serialize on that lock, and the second one sees what the first wrote. A
 * check before the transaction would let both pass and the city would hold
 * its council twice.
 */
export async function populateCity(validatedData: CityPopulationData): Promise<CityPopulationStats> {
    const { cityId } = validatedData;
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

        const adminBodies = await Promise.all(
            validatedData.administrativeBodies.map(adminBody =>
                tx.administrativeBody.create({
                    data: {
                        name: adminBody.name,
                        name_en: adminBody.name_en,
                        type: adminBody.type,
                        notificationBehavior: defaultNotificationBehavior(adminBody.type),
                        diavgeiaUnitIds: adminBody.diavgeiaUnitIds ?? [],
                        youtubeChannelUrl: adminBody.youtubeChannelUrl ?? null,
                        cityId: cityId,
                    },
                })
            )
        );

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

        const people = await Promise.all(
            validatedData.people.map(person =>
                tx.person.create({
                    data: {
                        name: person.name,
                        name_en: person.name_en,
                        name_short: person.name_short,
                        name_short_en: person.name_short_en,
                        image: person.image,
                        profileUrl: person.profileUrl,
                        cityId: cityId
                    },
                })
            )
        );

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
                            startDate: role.startDate,
                            endDate: role.endDate,
                            electedOrder: role.electedOrder ?? null,
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
        // rather than left alone because populate_city accepts an empty city of
        // any status.
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
