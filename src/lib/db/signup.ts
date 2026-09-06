import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { getLocationCoordinates, withCoordinates } from '@/lib/db/notifications';

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

/**
 * What the signup needs of a reader's preference for one municipality: the
 * places with their points, the topics, the two channel flags. One row and
 * one coordinate query, instead of every preference with its city boundary.
 */
export async function getSignupPreference(userId: string, cityId: string) {
    const preference = await prisma.notificationPreference.findUnique({
        where: { userId_cityId: { userId, cityId } },
        include: { interests: true, locations: true },
    });
    if (!preference) return null;
    const coordinates = await getLocationCoordinates(preference.locations.map((l) => l.id));
    return {
        locations: withCoordinates(preference.locations, coordinates),
        topics: preference.interests,
        notifyByPhone: preference.notifyByPhone,
        notifyByEmail: preference.notifyByEmail,
    };
}

/** The reader's petition for one municipality, if they signed it. */
export async function getUserPetition(userId: string, cityId: string) {
    return prisma.petition.findUnique({
        where: { userId_cityId: { userId, cityId } },
        select: { is_resident: true, is_citizen: true, other_relation: true },
    });
}
