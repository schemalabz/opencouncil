"use server"
import { City, CouncilMeeting, Party, Person, SpeakerSegment, Subject, Topic, TopicLabel, Role } from "@prisma/client";
import prisma from "./db/prisma";
import { PersonWithRelations } from "./db/people";
import { getPartyFromRoles } from "./utils";

export type TopicStatistics = Required<Pick<Statistics, 'topics'>> & Omit<Statistics, 'topics'>;
export type PartyStatistics = Required<Pick<Statistics, 'parties'>> & Omit<Statistics, 'parties'>;
export type PersonStatistics = Required<Pick<Statistics, 'people'>> & Omit<Statistics, 'people'>;

export type StatisticsOfPerson = TopicStatistics;
export type StatisticsOfCity = TopicStatistics & PartyStatistics & PersonStatistics;
export type StatisticsOfParty = TopicStatistics & PersonStatistics;
export type StatisticsOfTopic = PersonStatistics & PartyStatistics;
export type StatisticsOfCouncilMeeting = TopicStatistics & PartyStatistics & PersonStatistics;


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
type SpeakerSegmentInfo = SpeakerSegment & {
    speakerTag: {
        person: (Person & {
            roles: (Role & {
                party: Party | null;
            })[];
        }) | null;
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

    transcript = await prisma.speakerSegment.findMany({
        where: {
            meetingId: meetingId,
            cityId: cityId,
            speakerTag: {
                personId: personId,
                // Remove party filtering from query - we'll filter in application code
                // to ensure we only include segments from when person was actually affiliated with the party
            },
            subjects: subjectId ? {
                // TODO: this is somewhat incorrect, as a speaker segment can have multiple subjects.
                //       We should probably use the highlighted utterances instead.
                some: {
                    subjectId: subjectId
                }
            } : undefined,
            meeting: administrativeBodyId ? {
                administrativeBodyId: administrativeBodyId
            } : undefined,
            NOT: {
                summary: {
                    type: "procedural"
                }
            }

        },
        include: {
            speakerTag: {
                include: {
                    person: {
                        include: {
                            roles: {
                                include: {
                                    party: true
                                }
                            }
                        }
                    }
                }
            },
            summary: true,
            topicLabels: {
                include: {
                    topic: true
                }
            }
        }
    });

    // Filter by party in application code to ensure role was active at meeting time
    if (partyId) {
        transcript = transcript.filter(segment => {
            const person = segment.speakerTag.person;
            if (!person) return false;
            const activeParty = getPartyFromRoles(person.roles, meetingDate);
            return activeParty?.id === partyId;
        });
    }

    return getStatisticsForTranscript(transcript, groupBy, meetingDate);
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

export async function getStatisticsForTranscript(transcript: SpeakerSegmentInfo[], groupBy: ("person" | "topic" | "party")[], meetingDate?: Date): Promise<Statistics> {
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
        const segmentDuration = Math.max(0, segment.endTimestamp - segment.startTimestamp);
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