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
 * Whether the reader is on any municipality's list, with its channels on or
 * off. An unsubscribe keeps the row and turns its channels off, so a reader
 * who unsubscribed still counts, and the profile does not invite them again.
 * Deleting a municipality in the profile removes its row: a reader who deleted
 * their last one is on no list, so the invitation returns.
 */
export async function hasNotificationPreference(userId: string): Promise<boolean> {
    const preference = await prisma.notificationPreference.findFirst({ where: { userId }, select: { id: true } });
    return preference !== null;
}

/**
 * What the signup needs of a reader's preference for one municipality: the
 * places with their points, the topics, the email flag. One row and one
 * coordinate query, instead of every preference with its city boundary. The
 * phone channel is the person's, and comes with the account.
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
        notifyByEmail: preference.notifyByEmail,
    };
}

/** The channels a reader asked for in one municipality. */
export interface CityChannelRequest {
    notifyByEmail: boolean;
    /** The account's request, one per person. Notis owns what it means — see `readerSubscribedToCity`. */
    notifyByPhone: boolean;
}

/**
 * What the reader asked for in one municipality, or null when they never
 * asked. The row is not the answer on its own: an unsubscribe keeps it and
 * turns its channels off (`disableNotificationPreferenceByCityId`), so a
 * reader who left would count as a member for ever.
 *
 * Neither `getSignupPreference` nor `getNotificationPreferenceForCity`
 * answers this: the first reads the places and topics with their
 * coordinates, the second guards on the session and returns the whole row.
 */
export async function getCityChannelRequest(userId: string, cityId: string): Promise<CityChannelRequest | null> {
    const [preference, user] = await Promise.all([
        prisma.notificationPreference.findUnique({
            where: { userId_cityId: { userId, cityId } },
            select: { notifyByEmail: true },
        }),
        prisma.user.findUnique({ where: { id: userId }, select: { notifyByPhone: true } }),
    ]);
    if (!preference) return null;
    return { notifyByEmail: preference.notifyByEmail, notifyByPhone: user?.notifyByPhone ?? false };
}

/** The reader's petition for one municipality, if they signed it. */
export async function getUserPetition(userId: string, cityId: string) {
    return prisma.petition.findUnique({
        where: { userId_cityId: { userId, cityId } },
        select: { is_resident: true, is_citizen: true, other_relation: true },
    });
}
