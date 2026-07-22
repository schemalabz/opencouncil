"use server";

import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { subDays } from "date-fns";

export interface AdminDashboardStats {
    users: {
        total: number;
        newLast7Days: number;
        newPrev7Days: number;
        percentChange: number;
    };
    notifications: {
        usersWithPreferences: number;
        newPreferencesThisWeek: number;
        sentThisWeek: number;
    };
    petitions: {
        total: number;
        newThisWeek: number;
    };
    content: {
        meetingsAddedThisWeek: number;
        releasedOfThose: number;
        meetingHoursThisWeek: number;
        supportedCities: number;
    };
    engagement: {
        inbound: { total: number; whatsapp: number; sms: number };
        outbound: { total: number; whatsapp: number; sms: number };
        searches: { thisWeek: number; prevWeek: number; percentChange: number };
    };
}

export interface CitySubscriberStats {
    cityId: string;
    name: string;
    subscribers: number;
    population: number;
    perMille: number;
}

function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
    await withUserAuthorizedToEdit({});

    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);
    const fourteenDaysAgo = subDays(now, 14);

    const [
        totalUsers,
        newLast7Days,
        newPrev7Days,
        usersWithPreferences,
        newPreferencesThisWeek,
        notificationsSentThisWeek,
        totalPetitions,
        newPetitionsThisWeek,
        meetingsAddedThisWeek,
        releasedOfThose,
        meetingHoursThisWeek,
        supportedCities,
        messagesByChannelAndDirection,
        searchesThisWeek,
        searchesPrevWeek,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
        prisma.user.count({ where: { notificationPreferences: { some: {} } } }),
        prisma.notificationPreference.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.notificationDelivery.count({ where: { status: 'sent', sentAt: { gte: sevenDaysAgo } } }),
        prisma.petition.count(),
        prisma.petition.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.councilMeeting.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        // There is no releasedAt column, so this counts meetings created this
        // week that are currently released — not release events this week.
        prisma.councilMeeting.count({ where: { createdAt: { gte: sevenDaysAgo }, released: true } }),
        prisma.$queryRaw<Array<{ total_hours: number }>>`
            SELECT COALESCE(SUM(meeting_hours), 0) as total_hours
            FROM (
                SELECT (MAX(ss."endTimestamp") - MIN(ss."startTimestamp")) / 3600.0 as meeting_hours
                FROM "CouncilMeeting" cm
                JOIN "SpeakerSegment" ss ON ss."meetingId" = cm.id AND ss."cityId" = cm."cityId"
                WHERE cm.released = true AND cm."createdAt" >= ${sevenDaysAgo}
                GROUP BY cm.id, cm."cityId"
            ) meetings
        `,
        prisma.city.count({ where: { officialSupport: true } }),
        prisma.message.groupBy({
            by: ['channel', 'direction'],
            where: { createdAt: { gte: sevenDaysAgo } },
            _count: { _all: true },
        }),
        prisma.searchQuery.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.searchQuery.count({ where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    ]);

    const engagement: AdminDashboardStats['engagement'] = {
        inbound: { total: 0, whatsapp: 0, sms: 0 },
        outbound: { total: 0, whatsapp: 0, sms: 0 },
        searches: {
            thisWeek: searchesThisWeek,
            prevWeek: searchesPrevWeek,
            percentChange: percentChange(searchesThisWeek, searchesPrevWeek),
        },
    };
    for (const group of messagesByChannelAndDirection) {
        const count = group._count._all;
        engagement[group.direction][group.channel] += count;
        engagement[group.direction].total += count;
    }

    return {
        users: {
            total: totalUsers,
            newLast7Days,
            newPrev7Days,
            percentChange: percentChange(newLast7Days, newPrev7Days),
        },
        notifications: {
            usersWithPreferences,
            newPreferencesThisWeek,
            sentThisWeek: notificationsSentThisWeek,
        },
        petitions: {
            total: totalPetitions,
            newThisWeek: newPetitionsThisWeek,
        },
        content: {
            meetingsAddedThisWeek,
            releasedOfThose,
            meetingHoursThisWeek: Math.round(Number(meetingHoursThisWeek[0]?.total_hours ?? 0)),
            supportedCities,
        },
        engagement,
    };
}

/**
 * Notification subscribers per supported municipality, as thousandths (‰) of
 * its population — the marketing penetration metric. Sorted highest to lowest.
 * Supported cities without a recorded population are omitted (the ratio is
 * undefined for them).
 */
export async function getNotificationSubscribersByCity(): Promise<CitySubscriberStats[]> {
    await withUserAuthorizedToEdit({});

    const [cities, subscriberCounts] = await Promise.all([
        prisma.city.findMany({
            where: { officialSupport: true },
            select: { id: true, name: true, population: true },
        }),
        prisma.notificationPreference.groupBy({
            by: ["cityId"],
            _count: { _all: true },
        }),
    ]);

    const subscribersByCity = new Map(subscriberCounts.map(c => [c.cityId, c._count._all]));

    return cities
        .filter((city): city is typeof city & { population: number } => !!city.population)
        .map(city => {
            const subscribers = subscribersByCity.get(city.id) ?? 0;
            return {
                cityId: city.id,
                name: city.name,
                subscribers,
                population: city.population,
                perMille: (subscribers / city.population) * 1000,
            };
        })
        .sort((a, b) => b.perMille - a.perMille);
}
