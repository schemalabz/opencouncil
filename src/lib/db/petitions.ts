import 'server-only';
import prisma from './prisma';

/**
 * How many petitions a city has. PRIVACY: an aggregate COUNT only — nothing
 * about the petitioners leaves the database (see lib/landing/petitions). The
 * caller coarsens it to a public bucket before it reaches a client, which is
 * why this is a server-only module and not an exported action.
 */
export async function countCityPetitions(cityId: string): Promise<number> {
    return prisma.petition.count({ where: { cityId } });
}
