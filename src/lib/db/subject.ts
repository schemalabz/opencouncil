import prisma from './prisma';
import {
    Subject,
    SubjectSpeakerSegment,
    SpeakerSegment,
    SpeakerContribution,
    Decision,
    Highlight,
    Location,
    Topic,
    VoteType,
    Prisma,
    Realm,
    AdministrativeBodyType,
} from '@prisma/client';
import { PersonWithRelations } from '@/lib/db/people';
import { extractUtteranceIds } from '@/lib/utils/references';
import { roleWithRelationsInclude } from './types/roles';
// Import from the leaf (not the `../cache` barrel, which re-exports cache/queries → auth → env
// and would drag that heavy server-only chain into this widely-imported module).
import { createCache } from '../cache/index';

// The landing subject finders are realm + filter keyed in the data cache. Releasing/unreleasing
// a meeting busts the tag (see toggleMeetingRelease); the TTL is a safety net for other changes
// (e.g. a re-processed transcript) that don't toggle release.
const LANDING_SUBJECTS_TTL = 900; // 15 min
/** Cache tag for the landing subject lists/counts of a realm — revalidate it on meeting release. */
export const landingSubjectsTag = (realm: Realm) => `realm:${realm}:landing-subjects`;

/** Deterministic cache-key fragment for a filter set (arrays sorted so order can't split keys). */
function subjectFilterKey(f: MapSubjectFilters): string {
    return [
        f.monthsBack ?? '',
        f.daysBack ?? '',
        f.allTime ? '1' : '',
        (f.topicIds ?? []).slice().sort().join('.'),
        (f.cityIds ?? []).slice().sort().join('.'),
        (f.bodyTypes ?? []).slice().sort().join('.'),
        f.dateFrom ?? '',
        f.dateTo ?? '',
    ].join('|');
}

// Shared include blocks for Subject queries
const contributionsInclude = {
    include: {
        speaker: {
            include: {
                roles: roleWithRelationsInclude
            },
        },
    },
    orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
} satisfies Prisma.SpeakerContributionFindManyArgs;

const introducedByInclude = {
    include: {
        roles: roleWithRelationsInclude
    },
} satisfies Prisma.PersonDefaultArgs;

/** Person select with elected order — shared by votes and attendance queries */
const personWithElectedOrderSelect = {
    select: {
        id: true,
        name: true,
        roles: {
            select: { electedOrder: true, administrativeBodyId: true },
            where: { electedOrder: { not: null } },
        },
    },
} satisfies Prisma.PersonDefaultArgs;

const votesInclude = {
    select: {
        voteType: true,
        person: personWithElectedOrderSelect,
    },
    orderBy: { person: { name: 'asc' as const } },
} satisfies Prisma.SubjectVoteFindManyArgs;

const attendanceInclude = {
    select: {
        status: true,
        person: personWithElectedOrderSelect,
    },
} satisfies Prisma.SubjectAttendanceFindManyArgs;

// Type for location with coordinates
export type LocationWithCoordinates = Location & {
    coordinates?: {
        x: number;
        y: number;
    };
};

export type SubjectWithRelations = Subject & {
    contributions: (SpeakerContribution & {
        speaker: PersonWithRelations | null;
    })[];
    // Keep speakerSegments for backward compatibility during transition
    speakerSegments: (SubjectSpeakerSegment & {
        speakerSegment: SpeakerSegment;
    })[];
    highlights: Highlight[];
    location: LocationWithCoordinates | null;
    topic: Topic | null;
    introducedBy: PersonWithRelations | null;
    discussedIn: (Subject & { topic: Topic | null }) | null;
    decision: Decision | null;
    votes: { voteType: VoteType; person: { id: string; name: string; roles: { electedOrder: number | null; administrativeBodyId: string | null }[] } }[];
    attendance: { status: 'PRESENT' | 'ABSENT'; person: { id: string; name: string; roles: { electedOrder: number | null; administrativeBodyId: string | null }[] } }[];
};

/**
 * All-time total subjects per city ({ cityId: count }) for the Δήμοι *directory* tab, shown
 * next to each city's all-time meetings/persons totals (MunicipalitiesList). It is deliberately
 * independent of the map's date range/filters — it is NOT the count of pins currently on the
 * map, so it is expected to exceed the default-range map results. Same base visibility as the
 * map endpoints (realm, officialSupport, released, past-dated, discussed).
 */
export async function getSubjectCountsByCityCached(realm: Realm): Promise<Record<string, number>> {
    return createCache(
        async () => {
            const grouped = await prisma.subject.groupBy({
                by: ['cityId'],
                where: {
                    contributions: { some: {} },
                    councilMeeting: {
                        released: true,
                        dateTime: { lte: new Date() },
                        city: { officialSupport: true, realm },
                    },
                },
                _count: { _all: true },
            });
            return Object.fromEntries(grouped.map((g) => [g.cityId, g._count._all]));
        },
        ['subject-counts', realm],
        { revalidate: LANDING_SUBJECTS_TTL, tags: [landingSubjectsTag(realm)] },
    )();
}

/**
 * Discussion seconds per subject, matching the subject page exactly (getStatisticsForTranscript
 * in statistics.ts): tagged SUBJECT_DISCUSSION utterance durations over non-procedural segments,
 * falling back to legacy SubjectSpeakerSegment only for subjects with no tagged utterance at all.
 * Two GROUP BY aggregates, so it scales to the landing's large subject sets.
 */
export async function getDiscussionSecondsForSubjects(subjectIds: string[]): Promise<Map<string, number>> {
    const seconds = new Map<string, number>();
    if (subjectIds.length === 0) return seconds;

    // A subject with a tagged utterance gets a row (so it never falls back); the sum excludes
    // procedural segments, so it can legitimately be 0.
    const newRows = await prisma.$queryRaw<{ subjectId: string; seconds: number }[]>`
        SELECT u."discussionSubjectId" AS "subjectId",
               COALESCE(SUM(u."endTimestamp" - u."startTimestamp")
                        FILTER (WHERE sm.type IS NULL OR sm.type::text <> 'procedural'), 0)::float8 AS seconds
        FROM "Utterance" u
        JOIN "SpeakerSegment" ss ON ss.id = u."speakerSegmentId"
        LEFT JOIN "Summary" sm ON sm."speakerSegmentId" = ss.id
        WHERE u."discussionSubjectId" IN (${Prisma.join(subjectIds)})
          AND u."discussionStatus"::text = 'SUBJECT_DISCUSSION'
        GROUP BY u."discussionSubjectId"
    `;
    for (const r of newRows) seconds.set(r.subjectId, Math.max(0, Number(r.seconds)));

    // Legacy fallback: only subjects with no tagged utterance at all.
    const missing = subjectIds.filter((id) => !seconds.has(id));
    if (missing.length > 0) {
        const oldRows = await prisma.$queryRaw<{ subjectId: string; seconds: number }[]>`
            SELECT sss."subjectId" AS "subjectId",
                   COALESCE(SUM(ss."endTimestamp" - ss."startTimestamp")
                            FILTER (WHERE sm.type IS NULL OR sm.type::text <> 'procedural'), 0)::float8 AS seconds
            FROM "SubjectSpeakerSegment" sss
            JOIN "SpeakerSegment" ss ON ss.id = sss."speakerSegmentId"
            LEFT JOIN "Summary" sm ON sm."speakerSegmentId" = ss.id
            WHERE sss."subjectId" IN (${Prisma.join(missing)})
            GROUP BY sss."subjectId"
        `;
        for (const r of oldRows) seconds.set(r.subjectId, Math.max(0, Number(r.seconds)));
    }
    return seconds;
}

// ── Landing map subjects ──────────────────────────────────────────────────────
// Single source for the landing map's subject queries + wire types, imported by both the
// interactive routes and the server-side initial load (page.tsx) so nothing is re-declared.

export type MapSubjectFilters = {
    monthsBack?: number;
    daysBack?: number | null;
    allTime?: boolean;
    topicIds?: string[];
    cityIds?: string[];
    bodyTypes?: AdministrativeBodyType[];
    dateFrom?: string | null;
    dateTo?: string | null;
    /** true → located subjects (map pins); false → non-located (general/city list). */
    located?: boolean;
};

/**
 * Parse the landing map's query params into MapSubjectFilters. Validates the enum/numbers so junk
 * (`?bodyType=foo`, `?daysBack=abc`) is dropped rather than reaching Prisma and 500-ing.
 */
export function parseMapSubjectFilters(searchParams: URLSearchParams): MapSubjectFilters {
    const num = (v: string | null) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const isBodyType = (b: string): b is AdministrativeBodyType =>
        (Object.values(AdministrativeBodyType) as string[]).includes(b);
    return {
        monthsBack: num(searchParams.get('monthsBack')),
        daysBack: num(searchParams.get('daysBack')) ?? null,
        allTime: searchParams.get('allTime') === 'true',
        topicIds: (searchParams.get('topicIds') || '').split(',').filter(Boolean),
        cityIds: (searchParams.get('cityIds') || '').split(',').filter(Boolean),
        bodyTypes: (searchParams.get('bodyType') || '').split(',').filter(isBodyType),
        dateFrom: searchParams.get('dateFrom'),
        dateTo: searchParams.get('dateTo'),
    };
}

/** The subject-map wire shape — imported by the routes AND the client (no re-declaration). */
export type MapSubjectRow = {
    id: string;
    name: string;
    description: string;
    cityId: string;
    cityName: string;
    nameMunicipality: string;
    logoImage: string | null;
    councilMeetingId: string;
    meetingDate?: string;
    meetingName?: string;
    bodyName?: string | null;
    adminBodyType?: AdministrativeBodyType | null;
    locationText?: string;
    locationType?: string;
    topicId?: string | null;
    topicName?: string;
    topicColor: string;
    topicIcon?: string | null;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    geometry: GeoJSON.Geometry;
};

/** Non-located subject row — the same wire shape without the map-pin-only fields. */
export type GeneralSubjectRow = Omit<MapSubjectRow, 'geometry' | 'locationText' | 'locationType'>;

/** A municipality's non-located subjects + its centroid, for the "general subjects" marker.
 *  Carries the city's display fields (name/genitive/logo) so the client renders straight from the
 *  row instead of re-joining against the loaded city list. */
export type GeneralCityRow = {
    cityId: string;
    cityName: string;
    /** genitive municipality form, e.g. "Δήμος Χαλανδρίου" */
    nameMunicipality: string;
    logoImage: string | null;
    lng: number;
    lat: number;
    subjects: GeneralSubjectRow[];
};

const mapSubjectInclude = {
    councilMeeting: {
        select: {
            dateTime: true,
            name: true,
            administrativeBody: { select: { name: true, type: true } },
            // City display fields travel on every row so the client needn't reconcile against
            // the loaded city list (Subject reaches City only through councilMeeting).
            city: { select: { name: true, name_municipality: true, logoImage: true } },
        },
    },
    topic: { select: { name: true, name_en: true, colorHex: true, icon: true } },
    location: { select: { text: true, type: true } },
    speakerSegments: {
        select: {
            speakerSegment: {
                select: {
                    startTimestamp: true,
                    endTimestamp: true,
                    speakerTag: { select: { id: true } },
                },
            },
        },
    },
} satisfies Prisma.SubjectInclude;

type MapSubjectPayload = Prisma.SubjectGetPayload<{ include: typeof mapSubjectInclude }>;

/**
 * Shared where-clause for the map subject queries (realm required). `located` picks map-pins
 * (locationId set) vs the general/city list (locationId null). Future-dated meetings are always
 * excluded; explicit from/to overrides the quick range; allTime drops only the lower bound.
 */
export function buildMapSubjectWhere(realm: Realm, f: MapSubjectFilters): Prisma.SubjectWhereInput {
    const now = new Date();
    const dateTime: { gte?: Date; lte: Date } = { lte: now };
    if (f.dateFrom || f.dateTo) {
        if (f.dateFrom) dateTime.gte = new Date(f.dateFrom);
        if (f.dateTo) {
            const to = new Date(`${f.dateTo}T23:59:59.999`);
            if (to < now) dateTime.lte = to;
        }
    } else if (!f.allTime) {
        const threshold = new Date();
        if (f.daysBack && f.daysBack > 0) threshold.setDate(threshold.getDate() - f.daysBack);
        else threshold.setMonth(threshold.getMonth() - (f.monthsBack ?? 6));
        dateTime.gte = threshold;
    }
    return {
        locationId: f.located === false ? null : { not: null },
        // only subjects actually discussed (≥1 speaker contribution)
        contributions: { some: {} },
        ...(f.topicIds?.length ? { topicId: { in: f.topicIds } } : {}),
        ...(f.cityIds?.length ? { cityId: { in: f.cityIds } } : {}),
        councilMeeting: {
            released: true,
            dateTime,
            city: { officialSupport: true, realm },
            ...(f.bodyTypes?.length ? { administrativeBody: { type: { in: f.bodyTypes } } } : {}),
        },
    };
}

/** Unique speaker count for a subject from its (legacy) speaker-segment join. */
function speakerCountOf(s: MapSubjectPayload): number {
    return new Set((s.speakerSegments ?? []).map((sss) => sss.speakerSegment.speakerTag.id)).size;
}

/** The wire fields shared by located + non-located rows (everything except geometry/location). */
function toGeneralSubjectRow(s: MapSubjectPayload, discussionSeconds: Map<string, number>): GeneralSubjectRow {
    return {
        id: s.id,
        name: s.name,
        description: s.description,
        cityId: s.cityId,
        cityName: s.councilMeeting.city.name,
        nameMunicipality: s.councilMeeting.city.name_municipality,
        logoImage: s.councilMeeting.city.logoImage,
        councilMeetingId: s.councilMeetingId,
        meetingDate: s.councilMeeting?.dateTime?.toISOString(),
        meetingName: s.councilMeeting?.name,
        bodyName: s.councilMeeting?.administrativeBody?.name ?? null,
        adminBodyType: s.councilMeeting?.administrativeBody?.type ?? null,
        topicId: s.topicId,
        topicName: s.topic?.name,
        topicColor: s.topic?.colorHex || '#627BBC',
        topicIcon: s.topic?.icon,
        discussionTimeSeconds: Math.round(discussionSeconds.get(s.id) ?? 0),
        speakerCount: speakerCountOf(s),
    };
}

/** Located subjects (map pins) for the landing map, realm-scoped. Discussion time matches the
 *  subject page (getDiscussionSecondsForSubjects). Backs both /api/map/subjects and the initial load. */
export async function getMapSubjectsCached(realm: Realm, filters: MapSubjectFilters): Promise<MapSubjectRow[]> {
    return createCache(
        async () => {
            const subjects = await prisma.subject.findMany({
                where: buildMapSubjectWhere(realm, { ...filters, located: true }),
                include: mapSubjectInclude,
            });

            const locationIds = subjects.map((s) => s.locationId).filter((id): id is string => Boolean(id));
            if (locationIds.length === 0) return [];

            const geometries = await prisma.$queryRaw<{ id: string; geometry: string }[]>`
                SELECT id, ST_AsGeoJSON(coordinates, 15, 0)::text AS geometry
                FROM "Location"
                WHERE id IN (${Prisma.join(locationIds)})
            `;
            const geometryMap = new Map<string, GeoJSON.Geometry>(
                geometries.map((g) => {
                    const geom = JSON.parse(g.geometry) as GeoJSON.Geometry;
                    // PostGIS may return [lat, lon]; GeoJSON needs [lon, lat] (swap Greek Points).
                    if (geom.type === 'Point' && geom.coordinates.length === 2) {
                        const [first, second] = geom.coordinates;
                        if (first > 30 && first < 42 && second > 19 && second < 30) {
                            geom.coordinates = [second, first];
                        }
                    }
                    return [g.id, geom] as const;
                }),
            );

            const located = subjects.filter((s) => s.locationId && geometryMap.has(s.locationId));
            const discussionSeconds = await getDiscussionSecondsForSubjects(located.map((s) => s.id));
            return located.map((s) => ({
                ...toGeneralSubjectRow(s, discussionSeconds),
                locationText: s.location?.text,
                locationType: s.location?.type,
                geometry: geometryMap.get(s.locationId!)!,
            }));
        },
        ['map-subjects', realm, subjectFilterKey(filters)],
        { revalidate: LANDING_SUBJECTS_TTL, tags: [landingSubjectsTag(realm)] },
    )();
}

/** Non-located subjects grouped per municipality (+ city centroid), realm-scoped. Shares the
 *  where-clause and wire fields with getMapSubjectsCached. */
export async function getGeneralSubjectsCached(realm: Realm, filters: MapSubjectFilters): Promise<GeneralCityRow[]> {
    return createCache(
        async () => {
            const subjects = await prisma.subject.findMany({
                where: buildMapSubjectWhere(realm, { ...filters, located: false }),
                include: mapSubjectInclude,
            });
            if (subjects.length === 0) return [];

            const discussionSeconds = await getDiscussionSecondsForSubjects(subjects.map((s) => s.id));

            // Group by city.
            const byCity = new Map<string, MapSubjectPayload[]>();
            for (const s of subjects) {
                const list = byCity.get(s.cityId);
                if (list) list.push(s);
                else byCity.set(s.cityId, [s]);
            }

            // One centroid per city (PostGIS; City geometry is SRID 4326 → ST_X=lng, ST_Y=lat).
            // The city's display fields ride on the subject rows (see mapSubjectInclude).
            const centroids = await prisma.$queryRaw<{ id: string; lng: number; lat: number }[]>`
                SELECT id,
                       ST_X(ST_Centroid(geometry)) AS lng,
                       ST_Y(ST_Centroid(geometry)) AS lat
                FROM "City"
                WHERE id IN (${Prisma.join([...byCity.keys()])}) AND geometry IS NOT NULL
            `;
            const centroidMap = new Map(centroids.map((c) => [c.id, c]));

            return [...byCity.entries()]
                .map(([cityId, subs]): GeneralCityRow | null => {
                    const c = centroidMap.get(cityId);
                    if (!c) return null; // city without geometry → can't place a marker
                    const rows = subs.map((s) => toGeneralSubjectRow(s, discussionSeconds));
                    return {
                        cityId,
                        cityName: rows[0].cityName,
                        nameMunicipality: rows[0].nameMunicipality,
                        logoImage: rows[0].logoImage,
                        lng: Number(c.lng),
                        lat: Number(c.lat),
                        subjects: rows,
                    };
                })
                .filter((c): c is GeneralCityRow => c !== null);
        },
        ['general-subjects', realm, subjectFilterKey(filters)],
        { revalidate: LANDING_SUBJECTS_TTL, tags: [landingSubjectsTag(realm)] },
    )();
}

export async function getAllSubjects(): Promise<SubjectWithRelations[]> {
    try {
        const subjects = await prisma.subject.findMany({
            include: {
                contributions: contributionsInclude,
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                },
                highlights: true,
                location: true,
                topic: true,
                introducedBy: introducedByInclude,
                decision: true,
                discussedIn: {
                    include: {
                        topic: true,
                    },
                },
                votes: votesInclude,
                attendance: attendanceInclude,
            },
        });
        return subjects;
    } catch (error) {
        console.error('Error fetching all subjects:', error);
        throw new Error('Failed to fetch all subjects');
    }
}

export async function getSubjectsForMeeting(cityId: string, councilMeetingId: string): Promise<SubjectWithRelations[]> {
    try {
        // First get the subjects with all relations using Prisma
        const subjects = await prisma.subject.findMany({
            where: {
                cityId,
                councilMeetingId,
            },
            include: {
                contributions: contributionsInclude,
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                    orderBy: {
                        speakerSegment: {
                            startTimestamp: 'asc',
                        },
                    },
                },
                introducedBy: introducedByInclude,
                highlights: true,
                location: true,
                topic: true,
                decision: true,
                discussedIn: {
                    include: {
                        topic: true,
                    },
                },
                votes: votesInclude,
                attendance: attendanceInclude,
            },
        });

        // Then get the coordinates for locations that exist
        const locationIds = subjects.flatMap(s => s.location ? [s.location.id] : []);

        if (locationIds.length > 0) {
            const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
                SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                FROM "Location"
                WHERE id = ANY(${locationIds}::text[])
                AND type = 'point'
            `;
            const coordinatesByLocationId = new Map(locationCoordinates.map(l => [l.id, l]));

            // Merge coordinates into the subjects
            return subjects.map(subject => ({
                ...subject,
                location: subject.location
                    ? {
                        ...subject.location,
                        coordinates: coordinatesByLocationId.get(subject.location.id),
                    }
                    : null,
            }));
        }

        return subjects;
    } catch (error) {
        console.error('Error fetching subjects for meeting:', error);
        throw new Error('Failed to fetch subjects for meeting');
    }
}

/**
 * Get a single subject with all its relations
 */
export async function getSubject(subjectId: string): Promise<SubjectWithRelations | null> {
    try {
        const subject = await prisma.subject.findUnique({
            where: {
                id: subjectId,
            },
            include: {
                contributions: contributionsInclude,
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                    orderBy: {
                        speakerSegment: {
                            startTimestamp: 'asc',
                        },
                    },
                },
                introducedBy: introducedByInclude,
                highlights: true,
                location: true,
                topic: true,
                decision: true,
                discussedIn: {
                    include: {
                        topic: true,
                    },
                },
                votes: votesInclude,
                attendance: attendanceInclude,
            },
        });

        if (!subject || !subject.location) {
            return subject;
        }

        // Get coordinates if the subject has a location
        const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
            SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
            FROM "Location"
            WHERE id = ${subject.location.id}
            AND type = 'point'
        `;

        // Return the subject with location coordinates if available
        return {
            ...subject,
            location: {
                ...subject.location,
                coordinates: locationCoordinates[0],
            },
        };
    } catch (error) {
        console.error('Error fetching subject:', error);
        throw new Error('Failed to fetch subject');
    }
}

/**
 * Extract utterance IDs from contribution references for highlight creation
 * @param contributions - Array of speaker contributions
 * @returns Deduplicated array of utterance IDs
 */
export function extractUtteranceIdsFromContributions(
    contributions: { text: string }[]
): string[] {
    const allIds: string[] = [];
    for (const contribution of contributions) {
        const ids = extractUtteranceIds(contribution.text);
        allIds.push(...ids);
    }
    return [...new Set(allIds)]; // Deduplicate
}

/**
 * Get all utterances tagged with a subject for debugging
 * Only accessible to superadmins
 */
export async function getUtterancesForSubject(subjectId: string) {
    const { getCurrentUser } = await import('@/lib/auth');
    const user = await getCurrentUser();

    // Only superadmins can access debug data
    if (!user?.isSuperAdmin) {
        return null;
    }

    const utterances = await prisma.utterance.findMany({
        where: {
            discussionSubjectId: subjectId,
            discussionStatus: {
                in: ['SUBJECT_DISCUSSION', 'PROCEDURAL_VOTE', 'VOTE']
            }
        },
        select: {
            id: true,
            text: true,
            startTimestamp: true,
            endTimestamp: true,
            discussionStatus: true,
            speakerSegment: {
                select: {
                    speakerTag: {
                        select: {
                            label: true,
                            person: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    }
                }
            }
        },
        orderBy: {
            startTimestamp: 'asc'
        }
    });

    return utterances;
}
