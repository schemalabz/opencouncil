import "server-only";
import prisma from "@/lib/db/prisma";

/**
 * The IANA time zone of a city, or null when the city does not exist.
 *
 * For callers that hold only a city id. Anything that already loaded the city
 * reads `city.timezone` instead of paying for a second query.
 */
export async function getCityTimezone(cityId: string): Promise<string | null> {
    const city = await prisma.city.findUnique({
        where: { id: cityId },
        select: { timezone: true },
    });
    return city?.timezone ?? null;
}
