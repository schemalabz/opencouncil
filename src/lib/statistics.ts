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
    const segments = await prisma.speakerSegment.findMany({
        where,
        include: {
            speakerTag: speakerTagInclude,
            ...(needsTopicLabels && {
                topicLabels: { include: { topic: true } }
            })
        }
    });

    // Add empty topicLabels to satisfy the type when not loaded
    transcript = needsTopicLabels
        ? segments
        : segments.map(seg => ({ ...seg, topicLabels: [] }));

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