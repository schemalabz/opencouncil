import "server-only";
import type { City } from "@prisma/client";
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
    // supported > demo > pending, by CityStatus declaration order
    { status: 'desc' as const },
    { name: 'asc' as const },
];

/**
 * Every city regardless of status — the superadmin-equivalent view, without
 * consulting the session. The caller authenticates the request out-of-band (a
 * service API key at the API-route layer).
 *
 * Must return exactly what `getCities({ includeNonPublic: true })` returns for a
 * session superadmin: `GET /api/cities?includeUnlisted=true` dispatches to one or
 * the other purely on how the caller authenticated, so a difference here is a
 * difference in what two credentials for the same access level can see. It used
 * to filter to non-pending, which meant listed + unlisted; with `unlisted` folded
 * into `pending` that same filter would now hide the staged cities.
 *
 * MUST live in a non-"use server" module so it is not registered as a Next.js server
 * action — otherwise any client could invoke it directly and bypass the API-route auth.
 */
export async function getAllCitiesAsServiceKey(): Promise<CityWithCounts[]> {
    return prisma.city.findMany({
        include: { _count: CITY_COUNT_SELECT },
        orderBy: CITY_ORDER_BY,
    });
}

/**
 * Create a city with no auth check, for a caller that has already authorized
 * the write: `createCity` after its session gate, and the MCP admin tools,
 * which carry a token instead of a session. Lives here for the same reason as
 * `getAllCitiesAsServiceKey`: cities.ts is a "use server" module.
 *
 * `peopleOrdering` stays a column with its default but nothing reads or writes
 * it any more: one order applies to every city.
 */
export async function createCityDirect(cityData: Omit<City, 'createdAt' | 'updatedAt' | 'peopleOrdering'>): Promise<City> {
    return prisma.city.create({ data: cityData });
}

/** The English name of a city, for an alert that needs nothing else of it. */
export async function getCityNameEn(cityId: string): Promise<string | null> {
    const city = await prisma.city.findUnique({ where: { id: cityId }, select: { name_en: true } });
    return city?.name_en ?? null;
}
