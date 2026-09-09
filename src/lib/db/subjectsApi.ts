// Server-only (NOT a "use server" action module). Every function here takes
// `includeUnreleased` from its caller, so as exported actions they would hand
// subjects of unreleased meetings to anyone who posted the right argument. The
// API routes authorize first. Same reason as meetingsList.ts.
import "server-only";
import { Prisma, NonAgendaReason, LocationType, Realm } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';
import { DEFAULT_SUBJECT_LIMIT, MAX_SUBJECT_LIMIT } from '@/lib/zod-schemas/subject';

/**
 * The wire shape of a subject in the REST API.
 *
 * Deliberately smaller than {@link import('@/lib/db/subject').SubjectWithRelations}:
 * the API contract carries the agenda record and the entities a subject points
 * at, not the discussion itself. Contributions, votes, attendance, highlights
 * and the decision stay out — they are large, they change shape as the
 * extraction pipeline improves, and an API contract must stay stable.
 */
const apiSubjectSelect = {
    id: true,
    name: true,
    description: true,
    cityId: true,
    councilMeetingId: true,
    agendaItemIndex: true,
    agendaItemTitle: true,
    nonAgendaReason: true,
    withdrawn: true,
    topic: {
        select: { id: true, name: true, name_en: true, colorHex: true, icon: true },
    },
    location: {
        select: { id: true, type: true, text: true },
    },
    introducedBy: {
        select: { id: true, name: true, name_en: true },
    },
    councilMeeting: {
        select: { id: true, name: true, name_en: true, dateTime: true },
    },
} satisfies Prisma.SubjectSelect;

type ApiSubjectRow = Prisma.SubjectGetPayload<{ select: typeof apiSubjectSelect }>;

export interface ApiSubject {
    id: string;
    name: string;
    description: string;
    cityId: string;
    meetingId: string;
    meetingName: string;
    meetingNameEn: string;
    meetingDate: string;
    agendaItemIndex: number | null;
    agendaItemTitle: string | null;
    nonAgendaReason: NonAgendaReason | null;
    withdrawn: boolean;
    topic: {
        id: string;
        name: string;
        name_en: string;
        colorHex: string;
        icon: string | null;
    } | null;
    location: {
        type: LocationType;
        text: string;
        coordinates: { lat: number; lng: number } | null;
    } | null;
    introducedBy: {
        id: string;
        name: string;
        name_en: string;
    } | null;
}

export interface ApiSubjectFilters {
    /** Restrict to one meeting of the city. */
    meetingId?: string;
    /** Restrict to subjects introduced by this person. */
    introducerId?: string;
    /** Earliest meeting date, inclusive. */
    from?: Date;
    /** Latest meeting date, inclusive. */
    to?: Date;
    /** Callers must authorize before they pass true. */
    includeUnreleased?: boolean;
    limit?: number;
}

function meetingWhere(realm: Realm, filters: ApiSubjectFilters): Prisma.CouncilMeetingWhereInput {
    const where: Prisma.CouncilMeetingWhereInput = {};

    // The public view carries three constraints, not one. A city ID is not a
    // secret — /api/cities/all hands out every ID, `pending` ones included — so
    // the released flag alone would serve a city we do not publish, and would
    // serve one realm's councils on another realm's domain.
    if (!filters.includeUnreleased) {
        where.released = true;
        where.city = { ...PUBLIC_CITY_WHERE, realm };
    }

    if (filters.from || filters.to) {
        where.dateTime = {
            ...(filters.from && { gte: filters.from }),
            ...(filters.to && { lte: filters.to }),
        };
    }
    return where;
}

/**
 * The subject filter behind every listing here. Exported so the visibility
 * rules can be asserted without a database.
 *
 * `includeUnreleased` drops the public-city and realm constraints as well as
 * the release constraint: the callers that pass it have authorized for this
 * city (or hold a service key), so they see their own city whatever its status.
 */
export function buildApiSubjectWhere(
    realm: Realm,
    cityId: string,
    filters: ApiSubjectFilters
): Prisma.SubjectWhereInput {
    const meeting = meetingWhere(realm, filters);
    return {
        cityId,
        ...(filters.meetingId && { councilMeetingId: filters.meetingId }),
        ...(filters.introducerId && { personId: filters.introducerId }),
        ...(Object.keys(meeting).length > 0 && { councilMeeting: meeting }),
    };
}

/**
 * Centroids of the locations these subjects point at, keyed by location id.
 *
 * Centroids, not ST_X/ST_Y of the raw geometry: a location can be a line or a
 * polygon. Raw SQL because the geometry column is an Unsupported() type.
 */
async function locationCentroids(rows: ApiSubjectRow[]): Promise<Map<string, { lat: number; lng: number }>> {
    const locationIds = [...new Set(rows.map(row => row.location?.id).filter((id): id is string => id != null))];
    const centroids = new Map<string, { lat: number; lng: number }>();
    if (locationIds.length === 0) return centroids;

    const coordinates = await prisma.$queryRaw<Array<{ id: string; lng: number; lat: number }>>`
        SELECT id, ST_X(ST_Centroid(coordinates)) AS lng, ST_Y(ST_Centroid(coordinates)) AS lat
        FROM "Location" WHERE id IN (${Prisma.join(locationIds)})`;
    for (const row of coordinates) centroids.set(row.id, { lat: row.lat, lng: row.lng });
    return centroids;
}

function toApiSubject(
    row: ApiSubjectRow,
    centroids: Map<string, { lat: number; lng: number }>
): ApiSubject {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        cityId: row.cityId,
        meetingId: row.councilMeetingId,
        meetingName: row.councilMeeting.name,
        meetingNameEn: row.councilMeeting.name_en,
        meetingDate: row.councilMeeting.dateTime.toISOString(),
        agendaItemIndex: row.agendaItemIndex,
        agendaItemTitle: row.agendaItemTitle,
        nonAgendaReason: row.nonAgendaReason,
        withdrawn: row.withdrawn,
        topic: row.topic,
        location: row.location
            ? {
                type: row.location.type,
                text: row.location.text,
                coordinates: centroids.get(row.location.id) ?? null,
            }
            : null,
        introducedBy: row.introducedBy,
    };
}

/**
 * Subjects of a city, newest meeting first, in agenda order within a meeting.
 */
export async function getApiSubjects(
    realm: Realm,
    cityId: string,
    filters: ApiSubjectFilters = {}
): Promise<ApiSubject[]> {
    const rows = await prisma.subject.findMany({
        where: buildApiSubjectWhere(realm, cityId, filters),
        select: apiSubjectSelect,
        orderBy: [
            { councilMeeting: { dateTime: 'desc' } },
            { agendaItemIndex: 'asc' },
            { name: 'asc' },
        ],
        take: Math.min(filters.limit ?? DEFAULT_SUBJECT_LIMIT, MAX_SUBJECT_LIMIT),
    });

    const centroids = await locationCentroids(rows);
    return rows.map(row => toApiSubject(row, centroids));
}

/** One subject of one meeting, or null when it does not exist or is not visible. */
export async function getApiSubject(
    realm: Realm,
    cityId: string,
    meetingId: string,
    subjectId: string,
    { includeUnreleased = false }: { includeUnreleased?: boolean } = {}
): Promise<ApiSubject | null> {
    const row = await prisma.subject.findFirst({
        where: {
            id: subjectId,
            ...buildApiSubjectWhere(realm, cityId, { meetingId, includeUnreleased }),
        },
        select: apiSubjectSelect,
    });
    if (!row) return null;

    const centroids = await locationCentroids([row]);
    return toApiSubject(row, centroids);
}
