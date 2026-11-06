import "server-only";
import type { City, Prisma } from "@prisma/client";
import prisma from "./prisma";
import { NotFoundError } from '@/lib/api/errors';
import type { CityBoundarySummary } from '@/lib/zod-schemas/city';
import type { CityWithCounts } from './cities';

/** Shared city-row read; callers own authorization, geometry and presentation. */
export async function getCityWithCountsDirect(cityId: string, db: Prisma.TransactionClient = prisma): Promise<CityWithCounts | null> {
    return db.city.findUnique({ where: { id: cityId }, include: { _count: CITY_COUNT_SELECT } });
}

/** Read metadata from the stored outline, never the simplified drawing geometry. */
export async function getCityBoundarySummary(cityId: string, db: Prisma.TransactionClient = prisma): Promise<CityBoundarySummary | null> {
    const rows = await db.$queryRaw<CityBoundarySummary[]>`
        SELECT replace(ST_GeometryType(geometry), 'ST_', '') AS "geometryType",
               ST_NumGeometries(geometry) AS "polygonCount"
        FROM "City" WHERE id = ${cityId} AND geometry IS NOT NULL
    `;
    return rows[0] ?? null;
}

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
export async function publishCityDemoDirect(cityId: string, db: Prisma.TransactionClient = prisma): Promise<City> {
    return db.city.update({
        where: { id: cityId, status: { in: ['pending', 'demo'] } },
        data: { status: 'demo' },
    });
}

/** Shared PostGIS write for callers that already authorized the city edit. Input is normalized by parseBoundaryInput. */
export async function updateCityGeometryDirect(id: string, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon, db: Prisma.TransactionClient = prisma): Promise<void> {
    const updated = await db.$executeRaw`
        UPDATE "City"
        SET geometry = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326),
            "updatedAt" = NOW()
        WHERE id = ${id}
    `;
    if (updated === 0) throw new NotFoundError('City not found');
}

type CityUpdate = { status: 'demo'; geometry?: never } | { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; status?: never };
type CityUpdateSnapshot = Pick<City, 'status'> & { boundary: CityBoundarySummary | null };

/**
 * Authorized callers only. Lock comparison and write together: two concurrent
 * retries must not both report a new publication/boundary. Existing writers
 * take the transaction client, so storage and eligibility rules stay shared.
 */
export async function applyCityUpdateDirect(cityId: string, update: CityUpdate): Promise<{
    before: CityUpdateSnapshot; after: CityUpdateSnapshot; changed: boolean; city: CityWithCounts;
}> {
    return prisma.$transaction(async db => {
        const rows = await db.$queryRaw<Pick<City, 'status'>[]>`SELECT status FROM "City" WHERE id = ${cityId} FOR UPDATE`;
        if (!rows[0]) throw new NotFoundError('City not found');
        const before = { status: rows[0].status, boundary: await getCityBoundarySummary(cityId, db) };
        let status = before.status;
        let changed = false;
        if (update.geometry !== undefined) {
            const equal = await db.$queryRaw<{ equal: boolean | null }[]>`
                SELECT ST_Equals(geometry, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(update.geometry)}), 4326)) AS equal
                FROM "City" WHERE id = ${cityId}
            `;
            changed = equal[0]?.equal !== true;
            if (changed) await updateCityGeometryDirect(cityId, update.geometry, db);
        } else if (before.status !== 'demo') {
            // The shared predicate still refuses supported cities.
            status = (await publishCityDemoDirect(cityId, db)).status;
            changed = true;
        }
        const city = await getCityWithCountsDirect(cityId, db);
        if (!city) throw new NotFoundError('City not found');
        return {
            city,
            before,
            after: { status, boundary: changed && update.geometry !== undefined ? await getCityBoundarySummary(cityId, db) : before.boundary },
            changed,
        };
    });
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
