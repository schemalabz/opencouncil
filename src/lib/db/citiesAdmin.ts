import "server-only";
import type { City, CityStatus, Prisma, Realm } from "@prisma/client";
import prisma from "./prisma";
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import type { CityBoundarySummary } from '@/lib/zod-schemas/city';
import type { CityWithCounts } from './cities';
import { CUSTOMER_CITY_WHERE } from '@/lib/cityStatus';
import { CITY_COUNT_SELECT, CITY_ORDER_BY } from "./cityListing";
export { CITY_COUNT_SELECT, CITY_ORDER_BY } from "./cityListing";

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
    if (cityData.status === 'demo') await assertDemoAllowed({ realm: cityData.realm });
    return prisma.city.create({ data: cityData });
}

type CityEdit = Partial<Omit<City, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * Update a city with no auth check, for `editCity` after its session gate.
 * The demo rule and the write run in one transaction. The row is not locked,
 * so a concurrent customer upgrade in the same realm can still pass: the
 * guard is against a mistaken write, not a race.
 */
export async function editCityDirect(id: string, cityData: CityEdit): Promise<City> {
    return prisma.$transaction(async db => {
        await assertDemoChangeAllowed(id, cityData, db);
        return db.city.update({ where: { id }, data: cityData });
    });
}

/**
 * The policy of `CityStatus.demo`: none in a realm that has a customer. A demo
 * shows what OpenCouncil looks like in a country we do not serve yet, and a
 * realm may have several; next to a supported city a demo reads as a second
 * customer. Throws a `ConflictError` that names the customer, so the MCP tool
 * returns it as its error text and the admin form shows it under the save.
 *
 * `exceptCityId` is the city being published, so a city that is itself
 * supported is refused by its own predicate, not by this check. Omit it for a
 * city that does not exist yet. A concurrent customer upgrade in the same
 * realm can still pass: the lock of `applyCityUpdateDirect` is per city row.
 * The guard is against a mistaken write, not a race.
 */
export async function assertDemoAllowed(
    { realm, exceptCityId }: { realm: Realm; exceptCityId?: string },
    db: Prisma.TransactionClient = prisma,
): Promise<void> {
    const customer = await db.city.findFirst({
        where: {
            ...CUSTOMER_CITY_WHERE,
            realm,
            ...(exceptCityId !== undefined && { id: { not: exceptCityId } }),
        },
        orderBy: { name: 'asc' },
        select: { id: true, name_en: true },
    });
    if (!customer) return;
    const subject = exceptCityId !== undefined ? `"${exceptCityId}"` : 'the city';
    throw new ConflictError(
        `Cannot publish ${subject} as a demo: realm ${realm} already has a supported city (${customer.name_en}). `
        + 'A demo is allowed only in a realm with no supported city. Nothing was saved.',
    );
}

/**
 * The demo rule for a change to an existing city. A change is a publication
 * when the city becomes a demo, or a demo moves to another realm, with or
 * without a status field. An existing demo that keeps its realm saves its
 * other fields unchecked, and so does a city that stays pending or supported.
 */
export async function assertDemoChangeAllowed(
    cityId: string,
    change: { status?: CityStatus; realm?: Realm },
    db: Prisma.TransactionClient = prisma,
): Promise<void> {
    const mayPublish = change.status === 'demo' || (change.status === undefined && change.realm !== undefined);
    if (!mayPublish) return;
    const current = await db.city.findUnique({ where: { id: cityId }, select: { status: true, realm: true } });
    if (!current) throw new NotFoundError('City not found');
    const status = change.status ?? current.status;
    const realm = change.realm ?? current.realm;
    if (status === 'demo' && (current.status !== 'demo' || realm !== current.realm)) {
        await assertDemoAllowed({ realm, exceptCityId: cityId }, db);
    }
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
        const rows = await db.$queryRaw<Pick<City, 'status' | 'realm'>[]>`SELECT status, realm FROM "City" WHERE id = ${cityId} FOR UPDATE`;
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
            await assertDemoAllowed({ realm: rows[0].realm, exceptCityId: cityId }, db);
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
