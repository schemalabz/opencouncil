"use server";
import { CouncilMeeting, AdministrativeBodyType, Prisma, Realm } from '@prisma/client';
import { revalidateTag, revalidatePath } from 'next/cache';
import prisma from "./prisma";
import { withUserAuthorizedToEdit, isUserAuthorizedToEdit } from '../auth';
import { buildDateFilter } from './reviews/dateFilters';
import { formatDateAsMeetingId } from '../utils/meetingId';
import { landingSubjectsTag } from './subject';
import { CUSTOMER_CITY_WHERE, PUBLIC_CITY_WHERE } from '../cityStatus';
// Import from the cache leaf (see the note in subject.ts) to keep the barrel's heavy chain out.
import { createCache } from '../cache/index';
// createCouncilMeetingDirect lives in a server-only module (not this "use server"
// one) so it is never a directly-callable action. createCouncilMeeting wraps it
// with the auth check.
import { createCouncilMeetingDirect } from './meetingsCreate';
// The list reads live in a server-only module so they are never callable
// actions: each takes `includeUnreleased` from its caller. Types only here.
export type { CouncilMeetingWithAdminBodyAndSubjects, CouncilMeetingWithSubjectPreview, MeetingListOptions } from './meetingsList';

const meetingWithAdminBodyInclude = {
    administrativeBody: true,
} satisfies Prisma.CouncilMeetingInclude;

export type CouncilMeetingWithAdminBody = Prisma.CouncilMeetingGetPayload<{
    include: typeof meetingWithAdminBodyInclude
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

export async function createCouncilMeeting(meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl' | 'calendarEventId'> & { audioUrl?: string, videoUrl?: string }): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ cityId: meetingData.cityId });
    return createCouncilMeetingDirect(meetingData);
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

const upcomingMeetingInclude = {
    city: { select: { id: true, name: true, name_municipality: true, logoImage: true, timezone: true } },
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
                city: { ...PUBLIC_CITY_WHERE, realm },
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
            // The `_en` columns come along because the OG image renders in the
            // locale of the page that embeds it, English included.
            select: {
                name: true,
                name_en: true,
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
                                name_en: true,
                                colorHex: true,
                                icon: true
                            }
                        }
                    }
                },
                city: {
                    select: {
                        name_municipality: true,
                        name_municipality_en: true,
                        logoImage: true
                    }
                },
                administrativeBody: {
                    select: {
                        name: true,
                        name_en: true
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

export interface MeetingListItem {
    id: string;
    cityId: string;
    administrativeBodyName: string | null;
    dateTime: Date;
}

export interface MeetingUploadLists {
    needsUpload: MeetingListItem[]; // Past meetings without a succeeded transcribe task, oldest first
    scheduled: MeetingListItem[]; // Future meetings, soonest first
}

const meetingListItemSelect = {
    id: true,
    cityId: true,
    dateTime: true,
    administrativeBody: { select: { name: true } },
} satisfies Prisma.CouncilMeetingSelect;

type MeetingListItemRow = Prisma.CouncilMeetingGetPayload<{ select: typeof meetingListItemSelect }>;

function toMeetingListItem(m: MeetingListItemRow): MeetingListItem {
    return { id: m.id, cityId: m.cityId, administrativeBodyName: m.administrativeBody?.name ?? null, dateTime: m.dateTime };
}

/**
 * Get the meetings behind the upload dashboard cards: meetings needing upload
 * and scheduled future meetings, sorted by date ascending.
 * These metrics are not review-specific, so they belong in meetings.ts
 */
export async function getMeetingUploadLists(last30Days: boolean = false): Promise<MeetingUploadLists> {
    // Cross-city review dashboard data (superadmin-only /admin/reviews).
    await withUserAuthorizedToEdit({});
    const now = new Date();

    const [needsUpload, scheduled] = await Promise.all([
        // Needs upload: past meetings without transcribe succeeded
        // (date filter reuses the shared last-30-days utility)
        prisma.councilMeeting.findMany({
            where: {
                AND: [
                    { city: CUSTOMER_CITY_WHERE },
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
                    buildDateFilter(last30Days)
                ]
            },
            select: meetingListItemSelect,
            orderBy: { dateTime: 'asc' }
        }),
        // Scheduled: meetings with dateTime in the future (not affected by the 30-day filter)
        prisma.councilMeeting.findMany({
            where: {
                dateTime: { gt: now },
                city: CUSTOMER_CITY_WHERE
            },
            select: meetingListItemSelect,
            orderBy: { dateTime: 'asc' }
        })
    ]);

    return {
        needsUpload: needsUpload.map(toMeetingListItem),
        scheduled: scheduled.map(toMeetingListItem),
    };
}
