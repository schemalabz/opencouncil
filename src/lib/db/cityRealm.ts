// Server-only, and deliberately not part of the "use server" cities.ts: this
// must stay off the Server Action surface, and importing cities.ts would pull
// its auth/next/headers chain into every task module that raises an alert.
import "server-only";
import type { Realm } from '@prisma/client';
import prisma from "@/lib/db/prisma";

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

/** How long the proxy trusts its copy of the cities. */
const CITY_REALMS_TTL_MS = 60_000;
/** The shortest time between two reads that an unknown id can cause. */
const CITY_REALMS_MISS_RELOAD_MS = 5_000;

let cityRealms: { byId: Map<string, Realm>; loadedAt: number } | null = null;
let cityRealmsLoad: Promise<Map<string, Realm>> | null = null;

async function loadCityRealms(): Promise<Map<string, Realm>> {
    cityRealmsLoad ??= prisma.city
        .findMany({ select: { id: true, realm: true } })
        .then((cities) => {
            const byId = new Map(cities.map((city) => [city.id, city.realm]));
            cityRealms = { byId, loadedAt: Date.now() };
            return byId;
        })
        .finally(() => {
            cityRealmsLoad = null;
        });
    return cityRealmsLoad;
}

/**
 * Whether `cityId` is a city of `realm`, from a copy of the cities that this
 * process keeps for a minute. For the proxy, which answers every request and
 * has no cache of Next behind it: `unstable_cache` stores nothing there.
 *
 * An id that the copy does not have causes a new read, at most one each five
 * seconds, so that a new city is not a 404 for a minute and a sweep of
 * unknown ids is not a query for each request.
 */
export async function isCityOfRealm(cityId: string, realm: Realm): Promise<boolean> {
    const age = cityRealms ? Date.now() - cityRealms.loadedAt : Infinity;
    const known = cityRealms?.byId.get(cityId);
    const stale = age > (known === undefined ? CITY_REALMS_MISS_RELOAD_MS : CITY_REALMS_TTL_MS);
    if (cityRealms && !stale) return known === realm;
    // A read that fails must not turn every city page into an error. The old
    // copy answers. With no copy the request continues, and the city layout
    // checks the id.
    const byId = await loadCityRealms().catch(() => cityRealms?.byId ?? null);
    return byId === null || byId.get(cityId) === realm;
}
