import "server-only";
import prisma from "@/lib/db/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/formatters/time";

/**
 * The IANA time zone of a city. A city that does not exist reads in
 * DEFAULT_TIMEZONE: it has no meetings or subjects to show in any zone.
 *
 * For callers that hold only a city id. Anything that already loaded the city
 * reads `city.timezone` instead of paying for a second query.
 */
export async function getCityTimezone(cityId: string): Promise<string> {
    const city = await prisma.city.findUnique({
        where: { id: cityId },
        select: { timezone: true },
    });
    return city?.timezone ?? DEFAULT_TIMEZONE;
}
