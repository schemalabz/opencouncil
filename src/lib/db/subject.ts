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
} from '@prisma/client';
import { PersonWithRelations } from '@/lib/db/people';
import { extractUtteranceIds } from '@/lib/utils/references';
import { roleWithRelationsInclude } from './types/roles';
import { normalizeGeometryCoordinates } from '@/lib/geo';
import { FALLBACK_TOPIC_COLOR, MAP_DEFAULT_MONTHS_BACK } from '@/lib/map/constants';
import type { MapSubjectsApiItem } from '@/lib/map/types';

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
}

/**
 * Subjects with locations from officially supported cities, for the map.
 * Returns the wire shape consumed by /api/map/subjects and the /map page
 * (see MapSubjectsApiItem in src/lib/map/types.ts).
 */
export async function getMapSubjects(filter: MapSubjectsFilter = {}): Promise<MapSubjectsApiItem[]> {
    const monthsBack = filter.monthsBack ?? MAP_DEFAULT_MONTHS_BACK;
    const dateThreshold = new Date();
    dateThreshold.setMonth(dateThreshold.getMonth() - monthsBack);

    const where: Prisma.SubjectWhereInput = {
        locationId: { not: null },
        councilMeeting: {
            city: { officialSupport: true },
            released: true,
            dateTime: { gte: dateThreshold },
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
                },
            },
            topic: {
                select: { id: true, name: true, name_en: true, colorHex: true, icon: true },
            },
            location: {
                select: { text: true, type: true },
            },
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
        },
    });

    const locationIds = subjects
        .map(s => s.locationId)
        .filter((id): id is string => Boolean(id));
    if (locationIds.length === 0) {
        return [];
    }

    const geometries = await prisma.$queryRaw<{ id: string; geometry: string }[]>`
        SELECT
            id,
            ST_AsGeoJSON(coordinates, 15, 0)::text AS geometry
        FROM "Location"
        WHERE id IN (${Prisma.join(locationIds)})
    `;

    // No-op for correctly stored rows; fixes legacy [lat, lng]-swapped rows.
    const geometryMap = new Map(
        geometries.map(g => [g.id, normalizeGeometryCoordinates(JSON.parse(g.geometry) as GeoJSON.Geometry)])
    );

    // Discussion metrics, new system first (Utterance.discussionSubjectId) —
    // newer meetings have no SubjectSpeakerSegment rows, so relying on the
    // legacy link alone would report most subjects as undiscussed. Lean
    // mirror of getBatchStatisticsForSubjects without person/party loads.
    const utterances = await prisma.utterance.findMany({
        where: {
            discussionSubjectId: { in: subjects.map(s => s.id) },
            discussionStatus: 'SUBJECT_DISCUSSION',
        },
        select: {
            discussionSubjectId: true,
            speakerSegmentId: true,
            startTimestamp: true,
            endTimestamp: true,
        },
    });
    const utterancesBySubject = new Map<string, typeof utterances>();
    for (const utterance of utterances) {
        if (!utterance.discussionSubjectId) continue;
        const list = utterancesBySubject.get(utterance.discussionSubjectId);
        if (list) {
            list.push(utterance);
        } else {
            utterancesBySubject.set(utterance.discussionSubjectId, [utterance]);
        }
    }
    const utteranceSegmentIds = [...new Set(utterances.map(u => u.speakerSegmentId))];
    const segmentSpeakers = utteranceSegmentIds.length > 0
        ? await prisma.speakerSegment.findMany({
            where: { id: { in: utteranceSegmentIds } },
            select: { id: true, speakerTag: { select: { id: true } } },
        })
        : [];
    const speakerTagBySegment = new Map(segmentSpeakers.map(segment => [segment.id, segment.speakerTag.id]));

    return subjects
        .filter(s => s.locationId && geometryMap.has(s.locationId))
        .map(s => {
            let totalTimeSeconds = 0;
            const uniqueSpeakerIds = new Set<string>();
            const subjectUtterances = utterancesBySubject.get(s.id);
            if (subjectUtterances && subjectUtterances.length > 0) {
                for (const utterance of subjectUtterances) {
                    totalTimeSeconds += Math.max(0, utterance.endTimestamp - utterance.startTimestamp);
                    const speakerTagId = speakerTagBySegment.get(utterance.speakerSegmentId);
                    if (speakerTagId) uniqueSpeakerIds.add(speakerTagId);
                }
            } else {
                for (const sss of s.speakerSegments || []) {
                    totalTimeSeconds += sss.speakerSegment.endTimestamp - sss.speakerSegment.startTimestamp;
                    uniqueSpeakerIds.add(sss.speakerSegment.speakerTag.id);
                }
            }

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
                locationType: s.location?.type ?? null,
                topicId: s.topic?.id ?? null,
                topicName: s.topic?.name ?? null,
                topicColor: s.topic?.colorHex ?? FALLBACK_TOPIC_COLOR,
                topicIcon: s.topic?.icon ?? null,
                discussionTimeSeconds: Math.round(totalTimeSeconds),
                speakerCount: uniqueSpeakerIds.size,
                geometry: geometryMap.get(s.locationId!)!,
            };
        });
}
