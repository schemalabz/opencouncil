import 'server-only';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { bodySeatTotals, type BodySeatTotals } from '@/lib/party/composition';

const bodySeatSelect = {
    personId: true,
    startDate: true,
    endDate: true,
    administrativeBody: { select: { type: true } },
} satisfies Prisma.RoleSelect;

/**
 * Active seats on each type of body in a city: the whole that the party page
 * divides a party's seats by.
 *
 * Uncached, as getParty is. A cached total falls behind the party's count when
 * an editor changes or deletes a body, because those routes do not revalidate
 * the people of the city.
 */
export async function getBodySeatTotals(cityId: string): Promise<BodySeatTotals> {
    const roles = await prisma.role.findMany({
        where: { administrativeBody: { cityId } },
        select: bodySeatSelect,
    });
    return bodySeatTotals(roles);
}
