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
