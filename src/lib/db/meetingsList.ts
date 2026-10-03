// Server-only. Every function here takes `includeUnreleased` from its caller,
// so the gated callers — the cached wrappers in lib/cache/queries.ts and the
// API route — authorize before calling. Kept apart from meetings.ts as its own
// concern: the list queries, their payload types and the page size.
import "server-only";
import { unreleasedMeetingWhere, type UnreleasedScope } from '@/lib/unreleased';
import { AdministrativeBodyType, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { meetingBodyTypeWhere } from "./meetingBodyFilter";
import { TAKES_PLACE_WHERE } from "@/lib/meetingLifecycleRules";
import { DECISION_KIND_SELECT } from "@/lib/tasks/pollDecisionsBackoff";
import { publicAdministrativeBodyRelation } from "./types/administrativeBody";
import { matchesEveryTerm, normalizeText, searchTerms } from "@/lib/utils";
import { meetingLabel } from "@/lib/meetingName";
import { meetingNameSelect } from "./types/meeting";

const meetingWithSubjectsInclude = {
    subjects: {
        orderBy: [
            { agendaSectionIndex: { sort: 'asc' as const, nulls: 'first' as const } },
            { agendaItemIndex: 'asc' as const },
            { name: 'asc' as const },
        ],
        include: {
            topic: true,
            _count: { select: { contributions: true } },
        },
    },
    administrativeBody: publicAdministrativeBodyRelation,
    continuationOf: DECISION_KIND_SELECT.continuationOf,
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
            { agendaSectionIndex: { sort: 'asc' as const, nulls: 'first' as const } },
            { agendaItemIndex: 'asc' as const },
            { name: 'asc' as const },
        ],
        select: {
            id: true,
            name: true,
            agendaItemIndex: true,
            agendaSectionIndex: true,
            nonAgendaReason: true,
            withdrawn: true,
            topic: { select: { colorHex: true, icon: true } },
            _count: { select: { contributions: true } },
        },
    },
    administrativeBody: publicAdministrativeBodyRelation,
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
    /** Every unreleased meeting. Prefer `unreleased`, which names whose they are. */
    includeUnreleased?: boolean;
    /** The unreleased meetings the viewer may see; released only when absent. */
    unreleased?: UnreleasedScope;
    limit?: number;
    page?: number;
    pageSize?: number;
    from?: Date;
    to?: Date;
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
    timeFilter?: 'upcoming' | 'past';
    /** Only meetings that take place on their date: no postponed or cancelled one. */
    takesPlace?: boolean;
    /**
     * Only these meetings. The search on the meetings tab finds the ids, and
     * this loads the card rows of one page of them in the list's own order.
     * No cached wrapper accepts it: a cache key per id list is never reused.
     */
    meetingIds?: string[];
}

/**
 * How many meetings a page holds.
 *
 * The query below and the cache key in lib/cache/queries.ts both default to
 * this. They have to agree: the key names a page of rows, and the query decides
 * which rows that is. Two literals drift apart in silence — the key would go on
 * describing a page of twelve while the query returned some other number, and
 * nothing would throw.
 */
export const DEFAULT_MEETING_PAGE_SIZE = 12;

/**
 * The `where`, ordering and window every list query over a city's meetings
 * shares, so the two projections below and the count cannot answer for
 * different sets of meetings.
 */
function meetingListQuery(
    cityId: string,
    { includeUnreleased, unreleased, limit, page, pageSize = DEFAULT_MEETING_PAGE_SIZE, from, to, administrativeBodyTypes, administrativeBodyIds, timeFilter, takesPlace, meetingIds }: MeetingListOptions,
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
        // Without the no-body rule, the overview timeline would lose meetings
        // that the rail beside it still lists.
        bodyFilter = meetingBodyTypeWhere(administrativeBodyTypes);
    }

    // The visibility filter and the body filter can both be an OR, so they
    // meet under AND rather than spread into one object.
    const where: Prisma.CouncilMeetingWhereInput = {
        cityId,
        ...(Object.keys(dateTimeFilter).length > 0 && { dateTime: dateTimeFilter }),
        AND: [includeUnreleased ? {} : unreleasedMeetingWhere(unreleased), bodyFilter, takesPlace ? TAKES_PLACE_WHERE : {}],
        ...(meetingIds && { id: { in: meetingIds } }),
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

/**
 * How many meetings the options select over every page. It reads the same
 * `where` as the list, so the total that a pager shows and the rows on its
 * pages cannot disagree.
 */
export async function countCouncilMeetings(cityId: string, options: MeetingListOptions = {}): Promise<number> {
    const { where } = meetingListQuery(cityId, options);
    return prisma.councilMeeting.count({ where });
}

/** What a meeting is found by: the columns of its label, and its subjects' names. */
const meetingSearchTextSelect = {
    id: true,
    ...meetingNameSelect,
    subjects: { select: { name: true } },
} satisfies Prisma.CouncilMeetingSelect;

type MeetingSearchTextRow = Prisma.CouncilMeetingGetPayload<{ select: typeof meetingSearchTextSelect }>;

/**
 * The text a meeting is found by. The same fields the meetings tab searched in
 * the browser before it paged on the server, so a query finds what it found:
 * the label the card shows — derived from the kind and number when no name is
 * stored — in Greek, in English and in the reader's locale (on a Serbian page
 * that is a transliteration neither stored name holds).
 */
function meetingSearchText(meeting: MeetingSearchTextRow, locale: string, timezone: string): string {
    return [
        ...[...new Set(['el', 'en', locale])].map(labelLocale => meetingLabel(meeting, labelLocale, timezone)),
        meeting.administrativeBody?.name,
        meeting.administrativeBody?.name_en,
        ...meeting.subjects.map(subject => subject.name),
    ].filter(Boolean).join(' ');
}

/**
 * The ids of the meetings whose text holds every word of the query, in the
 * list's order (newest first). Null when the query has no words once
 * normalized — only spaces, or only accent marks — which is no search at all,
 * so the caller lists the meetings unfiltered.
 *
 * The match runs here and not in SQL: Postgres folds case but not accents
 * without the `unaccent` extension, and `normalizeText` is the folding that
 * every list in the app already uses. It reads short text only — a few hundred
 * KB for the largest city — and nothing of it reaches the browser.
 */
export async function findMeetingIdsMatching(cityId: string, query: string, options: MeetingListOptions, locale: string, timezone: string): Promise<string[] | null> {
    const terms = searchTerms(query);
    if (terms.length === 0) return null;
    const { where, orderBy } = meetingListQuery(cityId, { ...options, page: undefined, limit: undefined });
    const rows = await prisma.councilMeeting.findMany({ where, orderBy, select: meetingSearchTextSelect });
    return rows
        .filter(row => matchesEveryTerm(normalizeText(meetingSearchText(row, locale, timezone)), terms))
        .map(row => row.id);
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
