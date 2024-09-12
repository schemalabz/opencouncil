"use server"
import { City, CouncilMeeting, Party, Person, SpeakerSegment, Topic, TopicLabel } from "@prisma/client";
import prisma from "./db/prisma";
import { joinTranscriptSegments } from "./db/transcript";

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
    { personId, partyId, meetingId, cityId }: { personId?: Person["id"], partyId?: Party["id"], meetingId?: CouncilMeeting["id"], cityId?: City["id"] },
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
            }
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

    // Join adjacent segments with the same speaker
    transcript = joinAdjacentSpeakerSegments(transcript);

    function joinAdjacentSpeakerSegments(segments: SpeakerSegmentInfo[]): SpeakerSegmentInfo[] {
        if (segments.length === 0) {
            return segments;
        }

        const joinedSegments: SpeakerSegmentInfo[] = [];
        let currentSegment = segments[0];

        for (let i = 1; i < segments.length; i++) {
            if (segments[i].speakerTag.person?.id && currentSegment.speakerTag.person?.id
                && segments[i].speakerTag.person!.id === currentSegment.speakerTag.person.id) {
                // Join adjacent segments with the same speaker
                currentSegment.endTimestamp = segments[i].endTimestamp;
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
    return getStatisticsForTranscript(transcript, groupBy);
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
        statistics.speakingSeconds += segment.endTimestamp - segment.startTimestamp;
        segment.topicLabels.forEach(topicLabel => {
            const topic = topicLabel.topic;
            if (groupBy.includes("topic")) {
                const topicStatistics = statistics.topics!.find(t => t.item.id === topic.id);
                if (topicStatistics) {
                    topicStatistics.speakingSeconds += segment.endTimestamp - segment.startTimestamp;
                    topicStatistics.count++;
                } else {
                    statistics.topics!.push({ item: topic, speakingSeconds: segment.endTimestamp - segment.startTimestamp, count: 1 });
                }
            }
            if (groupBy.includes("person")) {
                const personStatistics = statistics.people!.find(p => p.item.id === segment.speakerTag.person?.id);
                if (personStatistics) {
                    personStatistics.speakingSeconds += segment.endTimestamp - segment.startTimestamp;
                    personStatistics.count++;
                } else if (segment.speakerTag.person) {
                    statistics.people!.push({ item: segment.speakerTag.person, speakingSeconds: segment.endTimestamp - segment.startTimestamp, count: 1 });
                }
            }
            if (groupBy.includes("party")) {
                const partyStatistics = statistics.parties!.find(p => p.item.id === segment.speakerTag.person?.partyId);
                if (partyStatistics) {
                    partyStatistics.speakingSeconds += segment.endTimestamp - segment.startTimestamp;
                    partyStatistics.count++;
                } else if (segment.speakerTag.person && segment.speakerTag.person.party) {
                    statistics.parties!.push({ item: segment.speakerTag.person.party, speakingSeconds: segment.endTimestamp - segment.startTimestamp, count: 1 });
                }
            }
        });
    });

    return statistics;
}