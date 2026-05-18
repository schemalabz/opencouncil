import "server-only";
import prisma from "./prisma";
import type { CityWithCounts } from "./cities";

// Mirrors CITY_COUNT_SELECT / CITY_ORDER_BY in cities.ts. Duplicated rather than
// imported because cities.ts is a "use server" module and may only export async
// functions (Next.js server-action constraint).
const CITY_COUNT_SELECT = {
    select: {
        persons: true,
        parties: true,
        councilMeetings: {
            where: { released: true },
        },
    },
};

const CITY_ORDER_BY = [
    { officialSupport: 'desc' as const },
    { status: 'desc' as const },
    { name: 'asc' as const },
];

/**
 * Returns listed + unlisted cities (superadmin-equivalent view) without consulting
 * the session. The caller is responsible for authenticating the request out-of-band
 * (e.g. via a service API key at the API-route layer).
 *
 * MUST live in a non-"use server" module so it is not registered as a Next.js server
 * action — otherwise any client could invoke it directly and bypass the API-route auth.
 */
export async function getAllCitiesAsServiceKey(): Promise<CityWithCounts[]> {
    return prisma.city.findMany({
        where: { status: { in: ['listed', 'unlisted'] } },
        include: { _count: CITY_COUNT_SELECT },
        orderBy: CITY_ORDER_BY,
    });
}
