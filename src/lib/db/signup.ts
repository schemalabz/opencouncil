import 'server-only';

import { prisma } from '@/lib/db/prisma';

/**
 * What the municipality pickers need of a signed-in reader: which
 * municipalities they already get notifications for, and which petitions
 * they have signed — two id lists, no geometry, no locations.
 */
export async function getUserSignupCityIds(userId: string): Promise<{
    subscribedCityIds: string[];
    petitionedCityIds: string[];
}> {
    const [preferences, petitions] = await Promise.all([
        prisma.notificationPreference.findMany({ where: { userId }, select: { cityId: true } }),
        prisma.petition.findMany({ where: { userId }, select: { cityId: true } }),
    ]);
    return {
        subscribedCityIds: preferences.map((p) => p.cityId),
        petitionedCityIds: petitions.map((p) => p.cityId),
    };
}

/** The reader's petition for one municipality, if they signed it. */
export async function getUserPetition(userId: string, cityId: string) {
    return prisma.petition.findUnique({
        where: { userId_cityId: { userId, cityId } },
        select: { is_resident: true, is_citizen: true },
    });
}
