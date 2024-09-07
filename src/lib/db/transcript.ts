import { SpeakerSegment, Utterance, Word, SpeakerTag } from "@prisma/client";
import prisma from "./prisma";

export type Transcript = (SpeakerSegment & {
    utterances: (Utterance & {
        words: Word[];
    })[];
    speakerTag: SpeakerTag;
})[];

export async function getTranscript(meetingId: string, cityId: string): Promise<Transcript> {
    const speakerSegments = await prisma.speakerSegment.findMany({
        where: {
            meetingId,
            cityId,
        },
        include: {
            speakerTag: true,
            utterances: {
                include: {
                    words: true,
                },
            },
        },
    });

    return speakerSegments;
}