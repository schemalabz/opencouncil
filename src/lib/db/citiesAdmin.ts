import "server-only";
import type { City, Prisma } from "@prisma/client";
import prisma from "./prisma";

/**
 * Create a city with no auth check, for a caller that has already authorized
 * the write: `createCity` after its session gate, and the MCP admin tools,
 * which carry a token instead of a session. Lives in a non-"use server"
 * module so it is not registered as a Server Action: cities.ts is one, and a
 * client could otherwise invoke this write directly and bypass the gate.
 *
 * `peopleOrdering` stays a column with its default but nothing reads or writes
 * it any more: one order applies to every city.
 */
export async function createCityDirect(cityData: Omit<City, 'createdAt' | 'updatedAt' | 'peopleOrdering'>): Promise<City> {
    return prisma.city.create({ data: cityData });
}

/** The English name of a city, for an alert that needs nothing else of it. */
export async function getCityNameEnAndTimezone(cityId: string): Promise<{ name_en: string; timezone: string } | null> {
    return prisma.city.findUnique({ where: { id: cityId }, select: { name_en: true, timezone: true } });
}

// Shared by the site's city lists (cities.ts) and the MCP. They live here, not
// in the "use server" cities.ts, which may export async functions only.
export const CITY_COUNT_SELECT = {
    select: {
        persons: true,
        parties: true,
        councilMeetings: {
            where: {
                released: true
            }
        }
    }
};

export const CITY_ORDER_BY = [
    // supported > demo > pending, by CityStatus declaration order
    { status: 'desc' as const },
    { name: 'asc' as const }
];

/**
 * Cities that match `where`, with their counts, in the order of the site's
 * lists. No access check: for callers that have done their own (the MCP's
 * superadmin listing).
 */
export async function listCitiesWithCounts(where: Prisma.CityWhereInput) {
    return prisma.city.findMany({ where, include: { _count: CITY_COUNT_SELECT }, orderBy: CITY_ORDER_BY });
}

/** How many cities each realm has in each status. */
export async function countCitiesByRealmAndStatus() {
    return prisma.city.groupBy({ by: ['realm', 'status'], _count: { _all: true } });
}
