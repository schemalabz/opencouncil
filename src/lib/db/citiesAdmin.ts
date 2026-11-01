import "server-only";
import type { City, Prisma } from "@prisma/client";
import prisma from "./prisma";
import { NotFoundError } from '@/lib/api/errors';

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

/** Authorized callers only. The predicate also prevents a concurrent customer upgrade being overwritten. */
export async function publishCityDemoDirect(cityId: string): Promise<City> {
    return prisma.city.update({
        where: { id: cityId, status: { in: ['pending', 'demo'] } },
        data: { status: 'demo' },
    });
}

/** Shared PostGIS write for callers that already authorized the city edit. Input is normalized by parseBoundaryInput. */
export async function updateCityGeometryDirect(id: string, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): Promise<void> {
    const updated = await prisma.$executeRaw`
        UPDATE "City"
        SET geometry = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326),
            "updatedAt" = NOW()
        WHERE id = ${id}
    `;
    if (updated === 0) throw new NotFoundError('City not found');
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
