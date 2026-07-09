"use server";
import { CouncilMeeting, AdministrativeBodyType, Prisma, Realm } from '@prisma/client';
import { revalidateTag, revalidatePath } from 'next/cache';
import prisma from "./prisma";
import { withUserAuthorizedToEdit, isUserAuthorizedToEdit } from '../auth';
import { buildDateFilter } from './reviews/dateFilters';
import { formatDateAsMeetingId } from '../utils/meetingId';
import { landingSubjectsTag } from './subject';
// Import from the cache leaf (see the note in subject.ts) to keep the barrel's heavy chain out.
import { createCache } from '../cache/index';

const meetingWithAdminBodyInclude = {
    administrativeBody: true,
} satisfies Prisma.CouncilMeetingInclude;

export type CouncilMeetingWithAdminBody = Prisma.CouncilMeetingGetPayload<{
    include: typeof meetingWithAdminBodyInclude
}>;

const meetingWithSubjectsInclude = {
    subjects: {
        orderBy: [
            { agendaItemIndex: 'asc' as const },
            { name: 'asc' as const },
        ],
        include: {
            topic: true,
            speakerSegments: true,
            _count: { select: { contributions: true } },
        },
    },
    administrativeBody: true,
} satisfies Prisma.CouncilMeetingInclude;

export type CouncilMeetingWithAdminBodyAndSubjects = Prisma.CouncilMeetingGetPayload<{
    include: typeof meetingWithSubjectsInclude
}>;

export async function deleteCouncilMeeting(cityId: string, id: string): Promise<void> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        await prisma.councilMeeting.delete({
            where: { cityId_id: { cityId, id } },
        });
    } catch (error) {
        console.error('Error deleting council meeting:', error);
        throw new Error('Failed to delete council meeting');
    }
}

export async function createCouncilMeeting(meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl'> & { audioUrl?: string, videoUrl?: string }): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ cityId: meetingData.cityId });
    return createCouncilMeetingDirect(meetingData);
}

/**
 * Create a council meeting without auth checks.
 * Use when authorization has already been verified by the caller
 * (e.g., via withServiceOrUserAuth in API route handlers).
 */
export async function createCouncilMeetingDirect(meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl'> & { audioUrl?: string, videoUrl?: string }): Promise<CouncilMeetingWithAdminBody> {
    return prisma.councilMeeting.create({
        data: meetingData,
        include: meetingWithAdminBodyInclude,
    });
}

/**
 * Generate a unique meeting ID for a city, handling collisions
 * by appending _2, _3, etc. (matches existing convention).
 */
export async function generateUniqueMeetingId(cityId: string, date: Date): Promise<string> {
    const baseId = formatDateAsMeetingId(date);

    // Fetch all existing meeting IDs with this base prefix in one query
    const existing = await prisma.councilMeeting.findMany({
        where: {
            cityId,
            id: { startsWith: baseId },
        },
        select: { id: true },
    });

    const existingIds = new Set(existing.map(m => m.id));

    if (!existingIds.has(baseId)) {
        return baseId;
    }

    for (let suffix = 2; suffix <= 20; suffix++) {
        const candidateId = `${baseId}_${suffix}`;
        if (!existingIds.has(candidateId)) {
            return candidateId;
        }
    }

    throw new Error(`Could not generate unique meeting ID for ${cityId} on ${baseId} — too many meetings on this date`);
}

export async function editCouncilMeeting(cityId: string, id: string, meetingData: Partial<Omit<CouncilMeeting, 'id' | 'cityId' | 'createdAt' | 'updatedAt'>>): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        const updatedMeeting = await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: meetingData,
            include: meetingWithAdminBodyInclude,
        });
        return updatedMeeting;
    } catch (error) {
        console.error('Error editing council meeting:', error);
        throw new Error('Failed to edit council meeting');
    }
}

export async function getCouncilMeeting(cityId: string, id: string): Promise<CouncilMeetingWithAdminBody | null> {
    const startTime = performance.now();
    try {
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id } },
            include: meetingWithAdminBodyInclude,
        });
        const endTime = performance.now();

        if (meeting && !meeting.released && !(await isUserAuthorizedToEdit({ cityId }))) {
            return null;
        }
        return meeting;
    } catch (error) {
        console.error('Error fetching council meeting:', error);
        throw new Error('Failed to fetch council meeting');
    }
}

export async function getCouncilMeetingsForCity(cityId: string, { includeUnreleased, limit, page, pageSize = 12, from, to, administrativeBodyTypes, administrativeBodyIds, timeFilter }: { includeUnreleased?: boolean; limit?: number; page?: number; pageSize?: number; from?: Date; to?: Date; administrativeBodyTypes?: AdministrativeBodyType[]; administrativeBodyIds?: string[]; timeFilter?: 'upcoming' | 'past' } = {}): Promise<CouncilMeetingWithAdminBodyAndSubjects[]> {

    try {
        // Calculate pagination
        const skip = page ? (page - 1) * pageSize : undefined;
        const take = page ? pageSize : limit;

        // Build dateTime filter
        const now = new Date();
        const timeFilterValue = timeFilter === 'upcoming'
            ? { gt: now }
            : timeFilter === 'past'
                ? { lte: now }
                : undefined;
        const dateTimeFilter = (from || to)
            ? {
                ...(from && { gte: from }),
                ...(to && { lte: to }),
            }
            : timeFilterValue;

        // Specific bodies (ids) take precedence over the broader type filter.
        let bodyFilter: Prisma.CouncilMeetingWhereInput = {};
        if (administrativeBodyIds && administrativeBodyIds.length > 0) {
            bodyFilter = { administrativeBodyId: { in: administrativeBodyIds } };
        } else if (administrativeBodyTypes && administrativeBodyTypes.length > 0) {
            bodyFilter = { administrativeBody: { type: { in: administrativeBodyTypes } } };
        }

        // First, get meetings with subjects and basic relationships
        const meetings = await prisma.councilMeeting.findMany({
            where: {
                cityId,
                released: includeUnreleased ? undefined : true,
                ...(dateTimeFilter && { dateTime: dateTimeFilter }),
                ...bodyFilter,
            },
            orderBy: timeFilter === 'upcoming'
                ? [{ dateTime: 'asc' }, { createdAt: 'asc' }]
                : [{ dateTime: 'desc' }, { createdAt: 'desc' }],
            ...(skip !== undefined && { skip }),
            ...(take && { take }),
            include: meetingWithSubjectsInclude,
        });

        return meetings;
    } catch (error) {
        console.error('Error fetching council meetings for city:', error);
        throw new Error('Failed to fetch council meetings for city');
    }
}

const upcomingMeetingInclude = {
    city: { select: { id: true, name: true, name_municipality: true, logoImage: true } },
    administrativeBody: true,
} satisfies Prisma.CouncilMeetingInclude;

export type UpcomingMeetingWithCity = Prisma.CouncilMeetingGetPayload<{
    include: typeof upcomingMeetingInclude
}>;

export async function getUpcomingMeetings(realm: Realm, { limit = 10 }: { limit?: number } = {}): Promise<UpcomingMeetingWithCity[]> {
    try {
        return await prisma.councilMeeting.findMany({
            where: {
                // public visibility guard: never expose unreleased (draft) meetings
                released: true,
                dateTime: { gt: new Date() },
                city: { status: 'listed', realm },
            },
            orderBy: [{ dateTime: 'asc' }, { createdAt: 'asc' }],
            take: limit,
            include: upcomingMeetingInclude,
        });
    } catch (error) {
        console.error('Error fetching upcoming meetings:', error);
        throw new Error('Failed to fetch upcoming meetings');
    }
}

// Cache tag for a realm's upcoming-meetings list — revalidated when a meeting's release toggles.
// Not exported: a "use server" module may only export async functions, and it's used only here.
const upcomingMeetingsTag = (realm: Realm) => `realm:${realm}:upcoming-meetings`;

/**
 * Realm-scoped, cached wrapper around getUpcomingMeetings for the landing (read on every render).
 * Short TTL because "upcoming" shrinks as meetings pass and the query is `dateTime > now()`, which
 * a cache key can't reflect; release toggles bust the tag for correctness in between.
 */
export async function getUpcomingMeetingsCached(realm: Realm, { limit = 10 }: { limit?: number } = {}): Promise<UpcomingMeetingWithCity[]> {
    return createCache(
        () => getUpcomingMeetings(realm, { limit }),
        ['upcoming-meetings', realm, String(limit)],
        { revalidate: 300, tags: [upcomingMeetingsTag(realm)] },
    )();
}

export async function toggleMeetingRelease(cityId: string, id: string, released: boolean): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        const updatedMeeting = await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: { released },
            include: meetingWithAdminBodyInclude,
        });
        // TODO: utilize api/cities/[cityId]/meetings/[meetingId] to edit the meeting
        revalidateTag(`city:${cityId}:meetings`, 'max');
        revalidatePath(`/${cityId}`, "layout");
        const city = await prisma.city.findUnique({ where: { id: cityId }, select: { realm: true } });
        if (city) {
            revalidateTag(landingSubjectsTag(city.realm), 'max');
            // a newly (un)released meeting can enter/leave the landing's upcoming list
            revalidateTag(upcomingMeetingsTag(city.realm), 'max');
        }
        return updatedMeeting;
    } catch (error) {
        console.error('Error toggling council meeting release:', error);
        throw new Error('Failed to toggle council meeting release');
    }
}

export async function getMeetingDataForOG(cityId: string, meetingId: string) {
    try {
        const data = await prisma.councilMeeting.findUnique({
            where: {
                cityId_id: { cityId, id: meetingId },
                released: true
            },
            select: {
                name: true,
                dateTime: true,
                subjects: {
                    select: {
                        id: true,
                        name: true,
                        agendaItemIndex: true,
                        nonAgendaReason: true,
                        _count: { select: { contributions: true } },
                        topic: {
                            select: {
                                name: true,
                                colorHex: true,
                                icon: true
                            }
                        }
                    }
                },
                city: {
                    select: {
                        name_municipality: true,
                        logoImage: true
                    }
                },
                administrativeBody: {
                    select: {
                        name: true
                    }
                }
            }
        });

        if (!data) return null;
        return data;
    } catch (error) {
        console.error('Error fetching meeting data for OG:', error);
        throw new Error('Failed to fetch meeting data for OG');
    }
}

export async function getLatestReleasedMeetingIdForCity(cityId: string): Promise<string | null> {
    const now = new Date();

    const upcoming = await prisma.councilMeeting.findFirst({
        where: { cityId, released: true, dateTime: { gt: now } },
        orderBy: { dateTime: 'asc' },
        select: { id: true },
    });

    if (upcoming) return upcoming.id;

    const latest = await prisma.councilMeeting.findFirst({
        where: { cityId, released: true },
        orderBy: { dateTime: 'desc' },
        select: { id: true },
    });

    return latest?.id ?? null;
}

export interface MeetingUploadMetrics {
    needsUpload: number; // Count of meetings
    scheduledFuture: number; // Count of future scheduled meetings
    oldestNeedsUpload: Date | null;
    earliestScheduledFuture: Date | null;
}

/**
 * Get meeting upload metrics: meetings needing upload and scheduled future meetings
 * These metrics are not review-specific, so they belong in meetings.ts
 */
export async function getMeetingUploadMetrics(last30Days: boolean = false): Promise<MeetingUploadMetrics> {
    const now = new Date();

    // Build date filter for past meetings (reuse shared utility)
    const dateFilter = buildDateFilter(last30Days);

    // Needs upload: past meetings without transcribe succeeded
    const needsUploadMeetings = await prisma.councilMeeting.findMany({
        where: {
            AND: [
                {
                    NOT: {
                        taskStatuses: {
                            some: {
                                type: 'transcribe',
                                status: 'succeeded'
                            }
                        }
                    }
                },
                dateFilter
            ]
        },
        select: {
            dateTime: true
        },
        orderBy: {
            dateTime: 'asc'
        }
    });

    // Scheduled future: meetings with dateTime in the future
    const scheduledFutureMeetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: {
                gt: now
            }
        },
        select: {
            dateTime: true
        },
        orderBy: {
            dateTime: 'asc'
        }
    });

    return {
        needsUpload: needsUploadMeetings.length,
        scheduledFuture: scheduledFutureMeetings.length,
        oldestNeedsUpload: needsUploadMeetings.length > 0 ? needsUploadMeetings[0].dateTime : null,
        earliestScheduledFuture: scheduledFutureMeetings.length > 0 ? scheduledFutureMeetings[0].dateTime : null,
    };
}
