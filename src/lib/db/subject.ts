import prisma from './prisma';
import {
    AdministrativeBodyType,
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
} from '@prisma/client';
import { PersonWithRelations } from '@/lib/db/people';
import { extractUtteranceIds } from '@/lib/utils/references';
import { roleWithRelationsInclude } from './types/roles';
import { normalizeGeometryCoordinates } from '@/lib/geo';
import { FALLBACK_TOPIC_COLOR, MAP_DEFAULT_MONTHS_BACK } from '@/lib/map/constants';
import type { MapSubjectsApiItem } from '@/lib/map/types';
import { getSubjectMetrics, type SubjectMetrics } from './subjectMetrics';

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
        const locationIds = subjects.filter(s => s.location).map(s => s.location!.id);

        if (locationIds.length > 0) {
            const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
                SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                FROM "Location"
                WHERE id = ANY(${locationIds}::text[])
                AND type = 'point'
            `;

            // Merge coordinates into the subjects
            return subjects.map(subject => ({
                ...subject,
                location: subject.location
                    ? {
                        ...subject.location,
                        coordinates: locationCoordinates.find(l => l.id === subject.location!.id),
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

export interface MapSubjectsFilter {
    monthsBack?: number;
    topicIds?: string[];
    cityIds?: string[];
    bodyTypes?: AdministrativeBodyType[];
    /** ISO dates (yyyy-mm-dd); when set they take precedence over monthsBack */
    dateFrom?: string;
    dateTo?: string;
}

/**
 * Subjects with locations from officially supported cities, for the map.
 * Returns the wire shape consumed by /api/map/subjects and the /map page
 * (see MapSubjectsApiItem in src/lib/map/types.ts).
 *
 * Discussion metrics default to a fresh SQL aggregation; production callers
 * pass the cached map (getSubjectMetricsCached, in the cache layer) so the
 * aggregation runs once per revalidation rather than per request. Kept out of
 * the db module's import graph so it stays free of next/cache.
 */
export async function getMapSubjects(
    filter: MapSubjectsFilter = {},
    metrics?: Record<string, SubjectMetrics>,
): Promise<MapSubjectsApiItem[]> {
    const subjectMetrics = metrics ?? await getSubjectMetrics();
    const monthsBack = filter.monthsBack ?? MAP_DEFAULT_MONTHS_BACK;
    const defaultThreshold = new Date();
    defaultThreshold.setMonth(defaultThreshold.getMonth() - monthsBack);

    const from = filter.dateFrom ? new Date(`${filter.dateFrom}T00:00:00`) : null;
    const to = filter.dateTo ? new Date(`${filter.dateTo}T23:59:59.999`) : null;
    const dateTime: Prisma.DateTimeFilter = {
        gte: from ?? (to ? undefined : defaultThreshold),
        ...(to ? { lte: to } : {}),
    };

    const where: Prisma.SubjectWhereInput = {
        councilMeeting: {
            city: { officialSupport: true },
            released: true,
            dateTime,
            ...(filter.cityIds && filter.cityIds.length > 0 ? { cityId: { in: filter.cityIds } } : {}),
            ...(filter.bodyTypes && filter.bodyTypes.length > 0
                ? { administrativeBody: { type: { in: filter.bodyTypes } } }
                : {}),
        },
        ...(filter.topicIds && filter.topicIds.length > 0 ? { topicId: { in: filter.topicIds } } : {}),
    };

    const subjects = await prisma.subject.findMany({
        where,
        include: {
            councilMeeting: {
                select: {
                    dateTime: true,
                    name: true,
                    city: { select: { name: true } },
                    administrativeBody: { select: { name: true, type: true } },
                },
            },
            topic: {
                select: { id: true, name: true, name_en: true, colorHex: true, icon: true },
            },
            location: {
                select: { text: true, type: true },
            },
        },
    });

    const locationIds = subjects
        .map(s => s.locationId)
        .filter((id): id is string => Boolean(id));

    const geometries = locationIds.length > 0
        ? await prisma.$queryRaw<{ id: string; geometry: string }[]>`
            SELECT
                id,
                ST_AsGeoJSON(coordinates, 15, 0)::text AS geometry
            FROM "Location"
            WHERE id IN (${Prisma.join(locationIds)})
        `
        : [];

    // No-op for correctly stored rows; fixes legacy [lat, lng]-swapped rows.
    const geometryMap = new Map(
        geometries.map(g => [g.id, normalizeGeometryCoordinates(JSON.parse(g.geometry) as GeoJSON.Geometry)])
    );

    return subjects
        .map(s => {
            const metric = subjectMetrics[s.id];
            return {
                id: s.id,
                name: s.name,
                description: s.description,
                cityId: s.cityId,
                cityName: s.councilMeeting?.city?.name ?? null,
                councilMeetingId: s.councilMeetingId,
                meetingDate: s.councilMeeting?.dateTime?.toISOString() ?? null,
                meetingName: s.councilMeeting?.name ?? null,
                locationText: s.location?.text ?? null,
                adminBodyName: s.councilMeeting?.administrativeBody?.name ?? null,
                adminBodyType: s.councilMeeting?.administrativeBody?.type ?? null,
                topicId: s.topic?.id ?? null,
                topicName: s.topic?.name ?? null,
                topicColor: s.topic?.colorHex ?? FALLBACK_TOPIC_COLOR,
                topicIcon: s.topic?.icon ?? null,
                discussionTimeSeconds: metric?.discussionSeconds ?? 0,
                speakerCount: metric?.speakerCount ?? 0,
                geometry: (s.locationId ? geometryMap.get(s.locationId) : null) ?? null,
            };
        });
}
