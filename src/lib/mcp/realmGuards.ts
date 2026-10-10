import "server-only";
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { NotFoundError } from '@/lib/api/errors';
import { filterCityIdsByRealm } from '@/lib/db/cities';
import { currentRealm } from './realm-context';

/**
 * Reject municipalities outside this connector's realm, so no tool — including
 * ones that take caller-supplied city ids — can reach across realms.
 */
export async function assertCitiesInRealm(cityIds: string[]): Promise<void> {
    if (cityIds.length === 0) return;

    const allowed = new Set(await filterCityIdsByRealm(cityIds, currentRealm()));
    const unknown = cityIds.filter(id => !allowed.has(id));
    if (unknown.length > 0) {
        throw new NotFoundError(`Unknown municipality: ${unknown.join(', ')}. See list_cities.`);
    }
}

export async function requireRealmCity(cityId: string): Promise<void> {
    return assertCitiesInRealm([cityId]);
}

/**
 * Body ids are opaque to the caller, so a hallucinated id, a stale one, or one
 * belonging to another city has to fail loudly. Filtering on it silently would
 * return an empty list — indistinguishable from a body that never met, which
 * is the reading these tools exist to prevent.
 */
export async function requireCityBodies(cityId: string, bodyIds: string[]): Promise<void> {
    return requireBodies(bodyIds, { cityId }, ` for ${cityId}`);
}

/**
 * As requireCityBodies, for a tool that spans municipalities: the bodies must
 * belong to the caller's `cityIds` when it names some, or to the realm. A body
 * of a municipality outside the caller's own filter would match nothing.
 */
export async function requireRealmBodies(bodyIds: string[], cityIds?: string[]): Promise<void> {
    return cityIds?.length
        ? requireBodies(bodyIds, { cityId: { in: cityIds } }, ` for ${cityIds.join(', ')}`)
        : requireBodies(bodyIds, { city: { realm: currentRealm() } }, '');
}

async function requireBodies(
    bodyIds: string[],
    scope: Prisma.AdministrativeBodyWhereInput,
    scopeLabel: string
): Promise<void> {
    const known = await prisma.administrativeBody.findMany({
        where: { ...scope, id: { in: bodyIds } },
        select: { id: true },
    });
    const found = new Set(known.map(body => body.id));
    const unknown = [...new Set(bodyIds)].filter(id => !found.has(id));
    if (unknown.length > 0) {
        throw new NotFoundError(
            `Unknown administrative body${scopeLabel}: ${unknown.join(', ')}. See get_city.`
        );
    }
}
