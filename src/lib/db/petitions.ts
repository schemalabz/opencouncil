"use server";

import prisma from "./prisma";

/**
 * Petition counts per city id. Drives the petitioned-municipalities heat
 * on the map and the Δήμοι panel ordering.
 */
export async function getPetitionCountsByCity(): Promise<Record<string, number>> {
    const groups = await prisma.petition.groupBy({
        by: ['cityId'],
        _count: { _all: true },
    });
    return Object.fromEntries(groups.map(group => [group.cityId, group._count._all]));
}
