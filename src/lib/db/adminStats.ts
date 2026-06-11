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
    };
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
    ]);

    const percentChange = newPrev7Days === 0
        ? (newLast7Days > 0 ? 100 : 0)
        : ((newLast7Days - newPrev7Days) / newPrev7Days) * 100;

    const engagement: AdminDashboardStats['engagement'] = {
        inbound: { total: 0, whatsapp: 0, sms: 0 },
        outbound: { total: 0, whatsapp: 0, sms: 0 },
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
            percentChange,
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
