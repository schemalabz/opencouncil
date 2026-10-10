// Server-only, not a "use server" module: that directive publishes every export
// as a Server Action, and only the release toggle is browser-called. It is
// wrapped in lib/actions/meetings.ts.
//
// Keep a gated wrapper and its ungated core next to each other in this file
// (getCouncilMeeting/getCouncilMeetingDirect). Choosing between them is
// choosing whether the viewer's session applies. A meeting is created through
// the lifecycle module (meetingLifecycle.ts), which meetingWrites.ts calls.
import "server-only";
import { AdministrativeBodyType, Prisma, Realm } from '@prisma/client';
import { revalidateTag, revalidatePath } from 'next/cache';
import prisma from "./prisma";
import { withUserAuthorizedToEdit, isUserAuthorizedToEdit } from '../auth';
import { buildDateFilter } from './reviews/dateFilters';
import { formatDateAsMeetingId } from '../utils/meetingId';
import { parseVideoId } from '@/lib/utils/youtube';
import { landingSubjectsTag } from './subject';
import { CUSTOMER_CITY_WHERE, PUBLIC_CITY_WHERE } from '../cityStatus';
import { isSecondaryBody, primaryMeetingWhere } from '@/lib/utils/bodyTier';
// Import from the cache leaf (see the note in subject.ts) to keep the barrel's heavy chain out.
import { createCache } from '../cache/index';
import { getCityRealm } from "./cityRealm";
import { deleteMeetingRecord, setMeetingReleased } from "./meetingLifecycle";
import { LifecycleRuleError, PUBLIC_RECORDING_WHERE, TAKES_PLACE_WHERE } from "@/lib/meetingLifecycleRules";
import { hideLinks } from "@/lib/meetingPublic";
import { DECISION_KIND_SELECT } from "@/lib/tasks/pollDecisionsBackoff";
import { meetingNameSelect } from './types/meeting';
// List reads and their payload types live in meetingsList.ts. Re-exported here
// as types only, so callers of this module keep one import.
export type { CouncilMeetingWithAdminBodyAndSubjects, CouncilMeetingWithSubjectPreview, MeetingListOptions } from './meetingsList';

const meetingWithAdminBodyInclude = {
    administrativeBody: true,
    continuationOf: DECISION_KIND_SELECT.continuationOf,
} satisfies Prisma.CouncilMeetingInclude;

export type CouncilMeetingWithAdminBody = Prisma.CouncilMeetingGetPayload<{
    include: typeof meetingWithAdminBodyInclude
}>;



/**
 * The tags of the city lists. A released meeting of a secondary body can
 * make its city public, or take that away (see PUBLIC_THROUGH_SECONDARY_WHERE,
 * #829): the lists must learn it now, not at their TTL — the map's has none.
 */
export function cityListTags(realm: Realm): string[] {
    return ['cities:all', `realm:${realm}:cities:all`];
}

/**
 * What the extraction of a pasted agenda needs to know about the meeting
 * (lib/agendaText.ts): its date and body for the roster, its city for the
 * language and the topics, and what the notifications that follow the
 * agenda read (lib/notifications/meetingTask.ts).
 */
export async function getMeetingForAgendaText(cityId: string, id: string) {
    return prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id } },
        select: {
            ...meetingNameSelect,
            id: true,
            cityId: true,
            administrativeBodyId: true,
            administrativeBody: { select: { name: true, name_en: true, notificationBehavior: true } },
            city: { select: { name: true, name_en: true, language: true, realm: true, timezone: true } },
        },
    });
}
export async function deleteCouncilMeeting(cityId: string, id: string): Promise<void> {
    // The city's, not the body admin's: deletion is not among their rights (#828).
    await withUserAuthorizedToEdit({ cityId });
    const meeting = await getCouncilMeetingDirect(cityId, id);
    await deleteMeetingRecord(cityId, id);
    // The last public meeting of a secondary body can be the city's only route
    // to the public lists.
    if (meeting?.released && isSecondaryBody(meeting.administrativeBody)) {
        const realm = await getCityRealm(cityId);
        if (realm) cityListTags(realm).forEach(tag => revalidateTag(tag, 'max'));
    }
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

/**
 * A council meeting, as the current viewer may see it.
 *
 * Consults the user session: an unreleased (draft) meeting resolves to `null`
 * for anyone who cannot edit the city. That is how a meeting page 404s a draft,
 * so `null` here means "absent or forbidden". Never read it as proof that the
 * row is gone.
 *
 * The session makes this request-scoped twice over. It reads `headers()`, so
 * the call cannot run inside `unstable_cache`. And with no session it can only
 * deny, so background work must call `getCouncilMeetingDirect` instead.
 */
export async function getCouncilMeeting(cityId: string, id: string): Promise<CouncilMeetingWithAdminBody | null> {
    try {
        const meeting = await getCouncilMeetingDirect(cityId, id);

        if (meeting && !meeting.released && !(await isUserAuthorizedToEdit({ cityId, councilMeetingId: id }))) {
            return null;
        }
        return meeting;
    } catch (error) {
        console.error('Error fetching council meeting:', error);
        throw new Error('Failed to fetch council meeting');
    }
}

/**
 * Fetch a council meeting with no visibility gate, for a caller that has no
 * user session to gate on: the task-server callbacks and the crons. There the
 * gated getter above can only deny, and callers read its `null` as "the meeting
 * does not exist".
 *
 * `null` here means the row is absent, and nothing else.
 */
export async function getCouncilMeetingDirect(cityId: string, id: string): Promise<CouncilMeetingWithAdminBody | null> {
    return prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id } },
        include: meetingWithAdminBodyInclude,
    });
}

const meetingByYouTubeVideoSelect = {
    cityId: true,
    id: true,
    youtubeUrl: true,
    city: { select: { realm: true } },
} satisfies Prisma.CouncilMeetingSelect;

/**
 * The released council meeting whose stored youtubeUrl is the given YouTube
 * video, or null. The SQL `contains` only narrows the candidates; each stored
 * URL is parsed, so an id inside a playlist parameter or at the start of a
 * longer path segment never counts. When several meetings share the video
 * (e.g. re-uploads), the most recent one wins.
 */
export async function findCouncilMeetingByYouTubeVideoId(videoId: string) {
    const candidates = await prisma.councilMeeting.findMany({
        where: { released: true, youtubeUrl: { contains: videoId } },
        orderBy: [{ dateTime: 'desc' }, { createdAt: 'desc' }],
        select: meetingByYouTubeVideoSelect,
    });
    return candidates.find(candidate => parseVideoId(candidate.youtubeUrl) === videoId) ?? null;
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
        const meetings = await prisma.councilMeeting.findMany({
            where: {
                // public visibility guard: never expose unreleased (draft) meetings
                released: true,
                dateTime: { gt: new Date() },
                // A postponed or cancelled meeting is not coming up.
                ...TAKES_PLACE_WHERE,
                city: { ...PUBLIC_CITY_WHERE, realm },
                ...primaryMeetingWhere,
            },
            orderBy: [{ dateTime: 'asc' }, { createdAt: 'asc' }],
            take: limit,
            include: upcomingMeetingInclude,
        });
        return meetings.map(hideLinks);
    } catch (error) {
        console.error('Error fetching upcoming meetings:', error);
        throw new Error('Failed to fetch upcoming meetings');
    }
}

// Cache tag for a realm's upcoming-meetings list — revalidated when a meeting's release toggles.
// Not exported: a "use server" module may only export async functions, and it's used only here.
export const upcomingMeetingsTag = (realm: Realm) => `realm:${realm}:upcoming-meetings`;

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
    return setMeetingReleasedWithEffects(cityId, id, released);
}

/**
 * Release or unrelease a meeting with no auth check, and bust the caches
 * that read its visibility. For a caller that has authorized the write, or
 * that runs with no session: the summarize callback releases the meeting of
 * a body whose pipeline runs unattended (#829).
 */
export async function setMeetingReleasedWithEffects(cityId: string, id: string, released: boolean): Promise<CouncilMeetingWithAdminBody> {
    try {
        // The module also releases or hides the other meetings of a postponement.
        const updatedMeeting = await setMeetingReleased(cityId, id, released);
        // TODO: utilize api/cities/[cityId]/meetings/[meetingId] to edit the meeting
        revalidateTag(`city:${cityId}:meetings`, 'max');
        revalidatePath(`/${cityId}`, "layout");
        const realm = await getCityRealm(cityId);
        if (realm) {
            revalidateTag(landingSubjectsTag(realm), 'max');
            // a newly (un)released meeting can enter/leave the landing's upcoming list
            revalidateTag(upcomingMeetingsTag(realm), 'max');
            if (isSecondaryBody(updatedMeeting.administrativeBody)) {
                cityListTags(realm).forEach(tag => revalidateTag(tag, 'max'));
            }
        }
        return updatedMeeting;
    } catch (error) {
        // A lifecycle rule explains itself to the admin (lib/actions/meetings.ts).
        if (error instanceof LifecycleRuleError) throw error;
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
                kind: true,
                sessionNumber: true,
                dateTime: true,
                subjects: {
                    select: {
                        id: true,
                        name: true,
                        agendaItemIndex: true,
                        agendaSectionIndex: true,
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
                        name: true,
                        name_en: true,
                        name_municipality: true,
                        name_municipality_en: true,
                        logoImage: true,
                        timezone: true
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
        where: { cityId, released: true, dateTime: { gt: now }, ...TAKES_PLACE_WHERE, ...primaryMeetingWhere },
        orderBy: { dateTime: 'asc' },
        select: { id: true },
    });

    if (upcoming) return upcoming.id;

    const latest = await prisma.councilMeeting.findFirst({
        where: { cityId, released: true, ...TAKES_PLACE_WHERE, ...primaryMeetingWhere },
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
        // (date filter reuses the shared last-30-days utility). A secondary
        // body uploads its own recordings, so its meetings are not ours to chase.
        prisma.councilMeeting.findMany({
            where: {
                AND: [
                    { city: CUSTOMER_CITY_WHERE },
                    // A postponed or cancelled meeting has nothing to upload, and
                    // a meeting by circulation takes no transcription.
                    TAKES_PLACE_WHERE,
                    PUBLIC_RECORDING_WHERE,
                    primaryMeetingWhere,
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
                city: CUSTOMER_CITY_WHERE,
                ...TAKES_PLACE_WHERE,
                ...primaryMeetingWhere,
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
