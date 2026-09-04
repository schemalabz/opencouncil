// Server-only (NOT a "use server" action module). Every function here takes
// `includeUnreleased` from its caller, so as exported actions they would hand
// unreleased meetings to anyone who posted the right argument. The gated
// callers are the cached wrappers in lib/cache/queries.ts and the API route,
// which authorize first. Same reason as meetingsCreate.ts.
import "server-only";
import { AdministrativeBodyType, Prisma } from '@prisma/client';
import prisma from "./prisma";

const meetingWithSubjectsInclude = {
    subjects: {
        orderBy: [
            { agendaItemIndex: 'asc' as const },
            { name: 'asc' as const },
        ],
        include: {
            topic: true,
            _count: { select: { contributions: true } },
        },
    },
    administrativeBody: true,
} satisfies Prisma.CouncilMeetingInclude;

export type CouncilMeetingWithAdminBodyAndSubjects = Prisma.CouncilMeetingGetPayload<{
    include: typeof meetingWithSubjectsInclude
}>;

// Cache keys over this projection carry MEETING_PREVIEW_CACHE_VERSION, which
// lives in lib/db/types/meeting.ts so client components can read it too.
// Bump it in the same edit that changes this include.
const meetingWithSubjectPreviewInclude = {
    subjects: {
        // Deliberately NOT ordered by `contributions._count` and NOT limited with
        // `take`. Prisma compiles a nested relation order-by into an unfiltered
        // `GROUP BY` over the whole SpeakerContribution table, and emits no LIMIT
        // for a nested take — so both bought three full-table aggregates and read
        // every row anyway. The app already re-sorts by importance, so ordering
        // here only has to match the projection this replaced.
        orderBy: [
            { agendaItemIndex: 'asc' as const },
            { name: 'asc' as const },
        ],
        select: {
            id: true,
            name: true,
            agendaItemIndex: true,
            nonAgendaReason: true,
            withdrawn: true,
            topic: { select: { colorHex: true, icon: true } },
            _count: { select: { contributions: true } },
        },
    },
    administrativeBody: true,
    // The public stage (lib/meetingStage.ts) reads which pipeline tasks have
    // succeeded. Whether segments exist at all — an imported transcript has no
    // task row — is counted per listed meeting below, not as a relation
    // `_count` here: Prisma compiles that into a GROUP BY over every segment
    // of the city, whatever the list's limit.
    taskStatuses: {
        where: { status: 'succeeded', type: { in: ['transcribe', 'summarize'] } },
        select: { type: true },
    },
} satisfies Prisma.CouncilMeetingInclude;

export type CouncilMeetingWithSubjectPreview = Prisma.CouncilMeetingGetPayload<{
    include: typeof meetingWithSubjectPreviewInclude
}> & {
    _count: { speakerSegments: number };
};

export interface MeetingListOptions {
    includeUnreleased?: boolean;
    limit?: number;
    page?: number;
    pageSize?: number;
    from?: Date;
    to?: Date;
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
    timeFilter?: 'upcoming' | 'past';
}

/**
 * The `where`, ordering and window every list query over a city's meetings
 * shares, so the two projections below and the count cannot answer for
 * different sets of meetings.
 */
function meetingListQuery(
    cityId: string,
    { includeUnreleased, limit, page, pageSize = 12, from, to, administrativeBodyTypes, administrativeBodyIds, timeFilter }: MeetingListOptions,
) {
    // Calculate pagination
    const skip = page ? (page - 1) * pageSize : undefined;
    const take = page ? pageSize : limit;

    // Build dateTime filter. An explicit from/to range and timeFilter are
    // independent constraints, so they intersect. Only `past` and `to` set
    // the same bound, and there the earlier of the two wins.
    const now = new Date();
    const upperBound = timeFilter === 'past'
        ? (to && to < now ? to : now)
        : to;
    const dateTimeFilter = {
        ...(timeFilter === 'upcoming' && { gt: now }),
        ...(from && { gte: from }),
        ...(upperBound && { lte: upperBound }),
    };

    // Specific bodies (ids) take precedence over the broader type filter.
    let bodyFilter: Prisma.CouncilMeetingWhereInput = {};
    if (administrativeBodyIds && administrativeBodyIds.length > 0) {
        bodyFilter = { administrativeBodyId: { in: administrativeBodyIds } };
    } else if (administrativeBodyTypes && administrativeBodyTypes.length > 0) {
        // A relation filter drops the rows whose body is NULL, and cities
        // imported before bodies existed have many. Everywhere else in the app
        // such a meeting reads as the council's (see timelineSide), so a filter
        // that asks for the council admits them too — otherwise the overview
        // timeline loses meetings the rail beside it still lists.
        bodyFilter = administrativeBodyTypes.includes('council')
            ? {
                OR: [
                    { administrativeBody: { type: { in: administrativeBodyTypes } } },
                    { administrativeBodyId: null },
                ],
            }
            : { administrativeBody: { type: { in: administrativeBodyTypes } } };
    }

    const where: Prisma.CouncilMeetingWhereInput = {
        cityId,
        released: includeUnreleased ? undefined : true,
        ...(Object.keys(dateTimeFilter).length > 0 && { dateTime: dateTimeFilter }),
        ...bodyFilter,
    };

    return {
        where,
        orderBy: (timeFilter === 'upcoming'
            ? [{ dateTime: 'asc' }, { createdAt: 'asc' }]
            : [{ dateTime: 'desc' }, { createdAt: 'desc' }]) as Prisma.CouncilMeetingOrderByWithRelationInput[],
        ...(skip !== undefined && { skip }),
        ...(take && { take }),
    };
}

export async function getCouncilMeetingsForCity(cityId: string, options: MeetingListOptions = {}): Promise<CouncilMeetingWithAdminBodyAndSubjects[]> {
    try {
        return await prisma.councilMeeting.findMany({
            ...meetingListQuery(cityId, options),
            include: meetingWithSubjectsInclude,
        });
    } catch (error) {
        console.error('Error fetching council meetings for city:', error);
        throw new Error('Failed to fetch council meetings for city');
    }
}

/**
 * The same meetings, carrying only what a card in a list draws.
 *
 * A `Subject` row is mostly prose — its description and context averaged 3.1 kB
 * on the largest city we run — and the full include hands every one of them to
 * a client component to render three titles. This one selects the scalars the
 * card and the importance sort read. Same rows, same query cost; a tenth of the
 * bytes.
 */
export async function getCouncilMeetingsWithSubjectPreview(cityId: string, options: MeetingListOptions = {}): Promise<CouncilMeetingWithSubjectPreview[]> {
    try {
        const meetings = await prisma.councilMeeting.findMany({
            ...meetingListQuery(cityId, options),
            include: meetingWithSubjectPreviewInclude,
        });
        const segments = await countSpeakerSegments(cityId, meetings.map(meeting => meeting.id));
        return meetings.map(meeting => ({ ...meeting, _count: { speakerSegments: segments.get(meeting.id) ?? 0 } }));
    } catch (error) {
        console.error('Error fetching council meeting previews for city:', error);
        throw new Error('Failed to fetch council meetings for city');
    }
}

/** Segments per listed meeting: one GROUP BY over those ids on the (meetingId, cityId) index. */
async function countSpeakerSegments(cityId: string, meetingIds: string[]): Promise<Map<string, number>> {
    if (meetingIds.length === 0) return new Map();
    const rows = await prisma.speakerSegment.groupBy({
        by: ['meetingId'],
        where: { cityId, meetingId: { in: meetingIds } },
        _count: { _all: true },
    });
    return new Map(rows.map(row => [row.meetingId, row._count._all]));
}
