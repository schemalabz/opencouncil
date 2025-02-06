"use server"
import { City, CouncilMeeting, Party, Person, SpeakerSegment, Subject, Topic, TopicLabel } from "@prisma/client";
import prisma from "./db/prisma";

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
    people?: Stat<Person>[]
}
type SpeakerSegmentInfo = SpeakerSegment & {
    speakerTag: {
        person: (Person & {
            party: Party | null;
        }) | null;
    },
    topicLabels: (TopicLabel & {
        topic: Topic;
    })[];
}

export async function getStatisticsFor(
    { personId, partyId, meetingId, cityId, subjectId }: { personId?: Person["id"], partyId?: Party["id"], meetingId?: CouncilMeeting["id"], cityId?: City["id"], subjectId?: Subject["id"] },
    groupBy: ("person" | "topic" | "party")[]
): Promise<Statistics> {
    let transcript: SpeakerSegmentInfo[];

    transcript = await prisma.speakerSegment.findMany({
        where: {
            meetingId: meetingId,
            cityId: cityId,
            speakerTag: {
                personId: personId,
                person: partyId ? {
                    partyId: partyId
                } : undefined
            },
            subjects: subjectId ? {
                // TODO: this is somewhat incorrect, as a speaker segment can have multiple subjects.
                //       We should probably use the highlighted utterances instead.
                some: {
                    subjectId: subjectId
                }
            } : undefined,
        },
        include: {
            speakerTag: {
                include: {
                    person: {
                        include: {
                            party: true
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

    return getStatisticsForTranscript(transcript, groupBy);
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

export async function getStatisticsForTranscript(transcript: SpeakerSegmentInfo[], groupBy: ("person" | "topic" | "party")[]): Promise<Statistics> {
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
        if (groupBy.includes("party") && segment.speakerTag.person?.party) {
            const partyStatistics = statistics.parties!.find(p => p.item.id === segment.speakerTag.person?.party?.id);
            if (!segment.speakerTag.person.isAdministrativeRole) { // e.g. council chair
                if (partyStatistics) {
                    partyStatistics.speakingSeconds += segmentDuration;
                    partyStatistics.count++;
                } else {
                    statistics.parties!.push({ item: segment.speakerTag.person.party, speakingSeconds: segmentDuration, count: 1 });
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