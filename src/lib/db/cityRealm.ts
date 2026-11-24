// Server-only, and deliberately not part of the "use server" cities.ts: this
// must stay off the Server Action surface, and importing cities.ts would pull
// its auth/next/headers chain into every task module that raises an alert.
// The proxy imports it too, so it stays free of heavy imports (a test checks).
import "server-only";
import type { Realm } from '@prisma/client';
import prisma from "@/lib/db/prisma";
import { createCache } from "@/lib/cache/index";

/**
 * The realm that owns a city, or null when the city does not exist.
 *
 * For callers that hold only a city id. Anything that already loaded the city
 * reads `city.realm` instead of paying for a second query.
 */
export async function getCityRealm(cityId: string): Promise<Realm | null> {
    const city = await prisma.city.findUnique({
        where: { id: cityId },
        select: { realm: true }
    });
    return city?.realm ?? null;
}

/**
 * The realm of each city that exists among `cityIds`; a missing id has no
 * entry.
 */
export async function getCityRealms(cityIds: string[]): Promise<Map<string, Realm>> {
    if (cityIds.length === 0) return new Map();
    const cities = await prisma.city.findMany({
        where: { id: { in: cityIds } },
        select: { id: true, realm: true },
    });
    return new Map(cities.map((city) => [city.id, city.realm]));
}

/**
 * A check of the shape that needs no I/O, so that a scanner's path costs no
 * cache read. Wider than `cityIdSchema` (src/lib/zod-schemas/city.ts), which
 * new ids follow: the list of cities decides.
 */
const CITY_ID_SHAPE = /^[a-z][a-z0-9_-]*$/;

/**
 * Whether `cityId` is a city of `realm`. Check a route's cityId with this
 * before you call a per-city cached function: per-city caches key by cityId,
 * so a junk id (a scanner probe) would otherwise write a `city:<junk>:*`
 * entry to the shared cache (#358). A city of another realm is not a city
 * here: tenant isolation.
 *
 * All callers share one cached list per realm (tag `cities:all`). The list
 * has no time limit: a city create, edit or delete clears it through the tag,
 * and a deploy starts a new cache. The proxy and the app share the cache, so
 * the clear reaches the proxy too (see `cache-handler.mjs`).
 */
export async function isCityOfRealm(cityId: string, realm: Realm): Promise<boolean> {
    return CITY_ID_SHAPE.test(cityId) && (await getAllCityIds(realm)).includes(cityId);
}

function getAllCityIds(realm: Realm): Promise<string[]> {
    return createCache(
        async () => (await prisma.city.findMany({ where: { realm }, select: { id: true } })).map((city) => city.id),
        ['cities', 'ids', realm],
        { tags: ['cities:all', `realm:${realm}:cities:all`] }
    )();
}
