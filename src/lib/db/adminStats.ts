"use server";

import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { subDays } from "date-fns";
import { CUSTOMER_CITY_WHERE } from "../cityStatus";
import type { SignupRow } from "../admin/signup-series";

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

/** A supported municipality with a population, so a per-capita figure means something. */
export interface SignupCity {
    cityId: string;
    name: string;
    population: number;
}

/** The email half of the signups page. The phone half comes from the Notis service. */
export interface EmailSignupData {
    cities: SignupCity[];
    /** One row per preference with the email summary on. */
    rows: SignupRow[];
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
        prisma.city.count({ where: CUSTOMER_CITY_WHERE }),
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
 * The email half of the signups page: the supported municipalities (with a
 * population, so ‰ means something), and one row per preference that has the
 * email summary on. Only preferences in those municipalities count, so the
 * tiles and the bars describe the same people over the same residents.
 *
 * The rows carry no end date, because turning the email summary off leaves no
 * record — the preference simply drops out of this query.
 */
export async function getEmailSignupData(): Promise<EmailSignupData> {
    await withUserAuthorizedToEdit({});

    const cities = (
        await prisma.city.findMany({
            where: CUSTOMER_CITY_WHERE,
            select: { id: true, name: true, population: true },
        })
    ).filter((city): city is typeof city & { population: number } => !!city.population);
    const preferences = await prisma.notificationPreference.findMany({
        where: { notifyByEmail: true, cityId: { in: cities.map((city) => city.id) } },
        select: { userId: true, cityId: true, createdAt: true },
    });

    return {
        cities: cities.map((city) => ({ cityId: city.id, name: city.name, population: city.population })),
        rows: preferences.map((pref) => ({
            userId: pref.userId,
            cityIds: [pref.cityId],
            createdAt: pref.createdAt,
            endedAt: null,
        })),
    };
}
