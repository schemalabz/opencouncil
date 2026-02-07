"use server"
import { City, CouncilMeeting, Party, Person, SpeakerSegment, Subject, Topic, TopicLabel, Role } from "@prisma/client";
import prisma from "./db/prisma";
import { PersonWithRelations } from "./db/people";
import { getPartyFromRoles } from "./utils";

export interface Stat<T> {
    item: T;
    speakingSeconds: number;
    count: number;
}
export interface Statistics {
    speakingSeconds: number;
    topics?: Stat<Topic>[]
    parties?: Stat<Party>[]
    people?: Stat<PersonWithRelations>[]
}

// Empty statistics constant to avoid duplication
const EMPTY_STATISTICS: Statistics = {
    speakingSeconds: 0,
    people: [],
    parties: [],
    topics: []
};

type SpeakerSegmentInfo = SpeakerSegment & {
    speakerTag: {
        person: PersonWithRelations | null;
    },
    topicLabels: (TopicLabel & {
        topic: Topic;
    })[];
}

export async function getStatisticsFor(
    { personId, partyId, meetingId, cityId, subjectId, administrativeBodyId }: {
        personId?: Person["id"],
        partyId?: Party["id"],
        meetingId?: CouncilMeeting["id"],
        cityId?: City["id"],
        subjectId?: Subject["id"],
        administrativeBodyId?: string | null
    },
    groupBy: ("person" | "topic" | "party")[]
): Promise<Statistics> {
    let transcript: SpeakerSegmentInfo[];
    let meetingDate: Date | undefined;

    // Get meeting date if meetingId is provided, for role date checking
    if (meetingId && cityId) {
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id: meetingId } },
            select: { dateTime: true }
        });
        meetingDate = meeting?.dateTime;
    }

    // If filtering by subjectId, calculate statistics from utterances directly
    // instead of entire speaker segments to get accurate time
    let speakerSegmentIds: string[] | undefined;
    let utteranceDurationsBySegment: Map<string, number> | undefined;

    // BACKWARD COMPATIBILITY: Support both new and old subject statistics systems
    // - New system (preferred): Uses Utterance.discussionSubjectId for granular time tracking
    // - Old system (fallback): Uses SubjectSpeakerSegment join table for legacy subjects
    if (subjectId) {
        // Try new system: Query utterances with discussionSubjectId
        const utterances = await prisma.utterance.findMany({
            where: {
                discussionSubjectId: subjectId,
                discussionStatus: 'SUBJECT_DISCUSSION'
            },
            select: {
                speakerSegmentId: true,
                startTimestamp: true,
                endTimestamp: true
            }
        });

        if (utterances.length > 0) {
            // NEW SYSTEM: Use granular utterance-based calculation
            utteranceDurationsBySegment = new Map();
            for (const utterance of utterances) {
                const duration = Math.max(0, utterance.endTimestamp - utterance.startTimestamp);
                const currentDuration = utteranceDurationsBySegment.get(utterance.speakerSegmentId) || 0;
                utteranceDurationsBySegment.set(utterance.speakerSegmentId, currentDuration + duration);
            }
            speakerSegmentIds = [...new Set(utterances.map(u => u.speakerSegmentId))];
        } else {
            // OLD SYSTEM: Fall back to SubjectSpeakerSegment relation
            const subjectSpeakerSegments = await prisma.subjectSpeakerSegment.findMany({
                where: { subjectId },
                select: { speakerSegmentId: true }
            });

            if (subjectSpeakerSegments.length === 0) {
                // Subject exists but has no speaker data in either system
                return EMPTY_STATISTICS;
            }

            speakerSegmentIds = subjectSpeakerSegments.map(s => s.speakerSegmentId);
            // Leave utteranceDurationsBySegment as undefined
            // This triggers full segment duration calculation in getStatisticsForTranscript
        }
    }

    // Determine what relations we actually need based on groupBy and filters
    const needsTopicLabels = groupBy.includes("topic");

    // Extract common query parts to avoid duplication
    const where = {
        id: speakerSegmentIds ? { in: speakerSegmentIds } : undefined,
        meetingId: meetingId,
        cityId: cityId,
        speakerTag: { personId: personId },
        meeting: administrativeBodyId ? { administrativeBodyId } : undefined,
        NOT: { summary: { type: "procedural" as const } }
    };

    const speakerTagInclude = {
        include: {
            person: {
                include: {
                    roles: {
                        include: {
                            party: true,
                            administrativeBody: true,
                            city: true
                        }
                    }
                }
            }
        }
    };

    // Conditionally include topicLabels only when grouping by topic
    if (needsTopicLabels) {
        transcript = await prisma.speakerSegment.findMany({
            where,
            include: {
                speakerTag: speakerTagInclude,
                topicLabels: { include: { topic: true } }
            }
        });
    } else {
        const segments = await prisma.speakerSegment.findMany({
            where,
            include: { speakerTag: speakerTagInclude }
        });
        transcript = segments.map(seg => ({ ...seg, topicLabels: [] }));
    }

    // Filter by party in application code to ensure role was active at meeting time
    if (partyId) {
        transcript = transcript.filter(segment => {
            const person = segment.speakerTag.person;
            if (!person) return false;
            const activeParty = getPartyFromRoles(person.roles, meetingDate);
            return activeParty?.id === partyId;
        });
    }

    return getStatisticsForTranscript(transcript, groupBy, meetingDate, utteranceDurationsBySegment);
}

/**
 * Batch-fetch statistics for multiple subjects in 2-3 DB queries instead of N×2.
 * Groups by ["person", "party"] (matching the meeting page usage).
 */
export async function getBatchStatisticsForSubjects(
    subjectIds: string[]
): Promise<Map<string, Statistics>> {
    const result = new Map<string, Statistics>();
    if (subjectIds.length === 0) return result;

    // 1. Batch-fetch all utterances for all subjects (new system)
    const allUtterances = await prisma.utterance.findMany({
        where: {
            discussionSubjectId: { in: subjectIds },
            discussionStatus: 'SUBJECT_DISCUSSION'
        },
        select: {
            discussionSubjectId: true,
            speakerSegmentId: true,
            startTimestamp: true,
            endTimestamp: true
        }
    });

    // Group utterances by subject
    const utterancesBySubject = new Map<string, typeof allUtterances>();
    for (const u of allUtterances) {
        if (!u.discussionSubjectId) continue;
        const list = utterancesBySubject.get(u.discussionSubjectId);
        if (list) {
            list.push(u);
        } else {
            utterancesBySubject.set(u.discussionSubjectId, [u]);
        }
    }

    // Determine which subjects need old system fallback
    const subjectsWithNewSystem = new Set(utterancesBySubject.keys());
    const subjectsNeedingFallback = subjectIds.filter(id => !subjectsWithNewSystem.has(id));

    // 2. Batch-fetch old system SubjectSpeakerSegment for remaining subjects
    let oldSystemBySubject = new Map<string, string[]>();
    if (subjectsNeedingFallback.length > 0) {
        const subjectSpeakerSegments = await prisma.subjectSpeakerSegment.findMany({
            where: { subjectId: { in: subjectsNeedingFallback } },
            select: { subjectId: true, speakerSegmentId: true }
        });
        for (const sss of subjectSpeakerSegments) {
            const list = oldSystemBySubject.get(sss.subjectId);
            if (list) {
                list.push(sss.speakerSegmentId);
            } else {
                oldSystemBySubject.set(sss.subjectId, [sss.speakerSegmentId]);
            }
        }
    }

    // Collect all unique speaker segment IDs we need to fetch
    const allSegmentIds = new Set<string>();

    // From new system: extract segment IDs from utterances
    const utteranceDurationsBySubjectAndSegment = new Map<string, Map<string, number>>();
    for (const [subjectId, utterances] of utterancesBySubject) {
        const durMap = new Map<string, number>();
        for (const u of utterances) {
            const duration = Math.max(0, u.endTimestamp - u.startTimestamp);
            durMap.set(u.speakerSegmentId, (durMap.get(u.speakerSegmentId) || 0) + duration);
            allSegmentIds.add(u.speakerSegmentId);
        }
        utteranceDurationsBySubjectAndSegment.set(subjectId, durMap);
    }

    // From old system: add segment IDs
    for (const segIds of oldSystemBySubject.values()) {
        for (const id of segIds) {
            allSegmentIds.add(id);
        }
    }

    // 3. Single batch fetch for all speaker segments with person/party includes
    if (allSegmentIds.size === 0) {
        // All subjects have no data
        for (const id of subjectIds) {
            result.set(id, { ...EMPTY_STATISTICS });
        }
        return result;
    }

    const speakerTagInclude = {
        include: {
            person: {
                include: {
                    roles: {
                        include: {
                            party: true,
                            administrativeBody: true,
                            city: true
                        }
                    }
                }
            }
        }
    };

    const segments = await prisma.speakerSegment.findMany({
        where: {
            id: { in: [...allSegmentIds] },
            NOT: { summary: { type: "procedural" as const } }
        },
        include: { speakerTag: speakerTagInclude }
    });

    // Index segments by ID for fast lookup
    const segmentById = new Map(segments.map(s => [s.id, s]));

    // 4. Compute statistics per subject
    const groupBy: ("person" | "party")[] = ["person", "party"];

    for (const subjectId of subjectIds) {
        const subjectUtteranceDurations = utteranceDurationsBySubjectAndSegment.get(subjectId);

        if (subjectUtteranceDurations) {
            // New system: use utterance-based durations
            const segmentIds = [...subjectUtteranceDurations.keys()];
            const subjectSegments = segmentIds
                .map(id => segmentById.get(id))
                .filter((s): s is NonNullable<typeof s> => s != null)
                .map(seg => ({ ...seg, topicLabels: [] as never[] }));

            result.set(subjectId, await getStatisticsForTranscript(
                subjectSegments as SpeakerSegmentInfo[],
                groupBy,
                undefined,
                subjectUtteranceDurations
            ));
        } else if (oldSystemBySubject.has(subjectId)) {
            // Old system: use full segment durations
            const segmentIds = oldSystemBySubject.get(subjectId)!;
            const subjectSegments = segmentIds
                .map(id => segmentById.get(id))
                .filter((s): s is NonNullable<typeof s> => s != null)
                .map(seg => ({ ...seg, topicLabels: [] as never[] }));

            result.set(subjectId, await getStatisticsForTranscript(
                subjectSegments as SpeakerSegmentInfo[],
                groupBy
            ));
        } else {
            result.set(subjectId, { ...EMPTY_STATISTICS });
        }
    }

    return result;
}

function joinAdjacentSpeakerSegments(segments: SpeakerSegmentInfo[]): SpeakerSegmentInfo[] {
    if (segments.length === 0) {
        return segments;
    }

    const joinedSegments: SpeakerSegmentInfo[] = [];
    let currentSegment = segments[0];

    for (let i = 1; i < segments.length; i++) {
        if (segments[i].speakerTag.person?.id && currentSegment.speakerTag.person?.id
            && segments[i].speakerTag.person!.id === currentSegment.speakerTag.person.id
            && segments[i].startTimestamp >= currentSegment.startTimestamp) {
            // Join adjacent segments with the same speaker
            currentSegment.endTimestamp = Math.max(currentSegment.endTimestamp, segments[i].endTimestamp);
            currentSegment.topicLabels = [...currentSegment.topicLabels, ...segments[i].topicLabels];
        } else {
            // Push the current segment and start a new one
            joinedSegments.push(currentSegment);
            currentSegment = segments[i];
        }
    }

    // Push the last segment
    joinedSegments.push(currentSegment);

    return joinedSegments;
}

export async function getStatisticsForTranscript(
    transcript: SpeakerSegmentInfo[],
    groupBy: ("person" | "topic" | "party")[],
    meetingDate?: Date,
    utteranceDurationsBySegment?: Map<string, number>
): Promise<Statistics> {
    const statistics: Statistics = {
        speakingSeconds: 0
    };

    if (groupBy.includes("topic")) {
        statistics.topics = [];
    }
    if (groupBy.includes("person")) {
        statistics.people = [];
    }
    if (groupBy.includes("party")) {
        statistics.parties = [];
    }

    transcript.forEach(segment => {
        // Use utterance durations if provided (for subject filtering),
        // otherwise use full segment duration
        const segmentDuration = utteranceDurationsBySegment
            ? (utteranceDurationsBySegment.get(segment.id) || 0)
            : Math.max(0, segment.endTimestamp - segment.startTimestamp);

        statistics.speakingSeconds += segmentDuration;

        // Handle person statistics
        if (groupBy.includes("person") && segment.speakerTag.person) {
            const personStatistics = statistics.people!.find(p => p.item.id === segment.speakerTag.person?.id);
            if (personStatistics) {
                personStatistics.speakingSeconds += segmentDuration;
                personStatistics.count++;
            } else {
                statistics.people!.push({ item: segment.speakerTag.person, speakingSeconds: segmentDuration, count: 1 });
            }
        }

        // Handle party statistics
        if (groupBy.includes("party") && segment.speakerTag.person?.roles) {
            // Get the party the person was affiliated with at the time of speaking
            const activeParty = getPartyFromRoles(segment.speakerTag.person.roles, meetingDate);
            if (activeParty) {
                const partyStatistics = statistics.parties!.find(p => p.item.id === activeParty.id);
                if (partyStatistics) {
                    partyStatistics.speakingSeconds += segmentDuration;
                    partyStatistics.count++;
                } else {
                    statistics.parties!.push({ item: activeParty, speakingSeconds: segmentDuration, count: 1 });
                }
            }
        }

        // Handle topic statistics
        if (groupBy.includes("topic") && segment.topicLabels.length > 0) {
            const topicDuration = segmentDuration / segment.topicLabels.length; // Divide duration among topics
            segment.topicLabels.forEach((topicLabel) => {
                const topic = topicLabel.topic;
                const topicStatistics = statistics.topics!.find(t => t.item.id === topic.id);
                if (topicStatistics) {
                    topicStatistics.speakingSeconds += topicDuration;
                    topicStatistics.count++;
                } else {
                    statistics.topics!.push({ item: topic, speakingSeconds: topicDuration, count: 1 });
                }
            });
        }
    });

    return statistics;
}