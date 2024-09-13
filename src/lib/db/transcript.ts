import { SpeakerSegment, Utterance, Word, SpeakerTag, Summary, TopicLabel, Topic } from "@prisma/client";
import prisma from "./prisma";

export type Transcript = (SpeakerSegment & {
    utterances: (Utterance & {
        words: Word[];
    })[];
    speakerTag: SpeakerTag;
    topicLabels: (TopicLabel & {
        topic: Topic;
    })[];
    summary: Summary | null;
})[];

export async function getTranscript(meetingId: string, cityId: string, {
    joinAdjacentSameSpeakerSegments = true,
}: {
    joinAdjacentSameSpeakerSegments?: boolean;
} = {}): Promise<Transcript> {
    const speakerSegments = await prisma.speakerSegment.findMany({
        where: {
            meetingId,
            cityId,
        },
        include: {
            speakerTag: true,
            utterances: {
                include: {
                    words: {
                        orderBy: {
                            startTimestamp: 'asc',
                        },
                    }
                },
                orderBy: {
                    startTimestamp: 'asc',
                },
            },
            summary: true,
            topicLabels: {
                include: {
                    topic: true,
                },
            },
        },
    });

    console.log(`Topic labels: ${speakerSegments.reduce((acc, segment) => {
        return acc + segment.topicLabels.length;
    }, 0)}`);

    if (joinAdjacentSameSpeakerSegments) {
        return joinTranscriptSegments(speakerSegments);
    } else {
        return speakerSegments;
    }
}

export function joinTranscriptSegments(speakerSegments: Transcript): Transcript {
    if (speakerSegments.length === 0) {
        return speakerSegments;
    }

    const joinedSegments = [];
    let currentSegment = speakerSegments[0];

    for (let i = 1; i < speakerSegments.length; i++) {
        if (speakerSegments[i].speakerTag.personId && currentSegment.speakerTag.personId
            && speakerSegments[i].speakerTag.personId === currentSegment.speakerTag.personId) {
            // Join adjacent segments with the same speaker
            currentSegment.endTimestamp = speakerSegments[i].endTimestamp;
            currentSegment.utterances = [...currentSegment.utterances, ...speakerSegments[i].utterances];
            currentSegment.topicLabels = [...currentSegment.topicLabels, ...speakerSegments[i].topicLabels];
        } else {
            // Push the current segment and start a new one
            joinedSegments.push(currentSegment);
            currentSegment = speakerSegments[i];
        }
    }

    // Push the last segment
    joinedSegments.push(currentSegment);

    return joinedSegments;
}