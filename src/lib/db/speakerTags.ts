"use server";
import { Person, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from '../auth';
import { publicSpeakerTagSelect, PublicSpeakerTag } from './types/speakerTag';

export async function getSpeakerTag(id: string): Promise<(PublicSpeakerTag & { person: Person | null }) | null> {
    const speakerTag = await prisma.speakerTag.findUnique({
        where: { id },
        select: { ...publicSpeakerTagSelect, person: true },
    });
    return speakerTag;
}

/** What a reviewer may change on a speaker tag. Hints are written by tasks only. */
type SpeakerTagEdit = { personId?: string | null; label?: string | null };

const speakerHintsSelect = {
    id: true,
    voiceprintPersonId: true,
    voiceprintConfidence: true,
    transcriptPersonId: true,
    transcriptConfidence: true,
} satisfies Prisma.SpeakerTagSelect;

export type SpeakerTagHints = Prisma.SpeakerTagGetPayload<{ select: typeof speakerHintsSelect }>;

/**
 * The speaker hints of a meeting's tags, for the reviewer's editor. This is the
 * only read of the hint columns that leaves the server, and it requires edit
 * rights. Tags without any hint are left out.
 */
export async function getSpeakerHintsForMeeting(cityId: string, meetingId: string): Promise<SpeakerTagHints[]> {
    await withUserAuthorizedToEdit({ cityId });
    return prisma.speakerTag.findMany({
        where: {
            speakerSegments: { some: { cityId, meetingId } },
            OR: [{ voiceprintPersonId: { not: null } }, { transcriptPersonId: { not: null } }],
        },
        select: speakerHintsSelect,
    });
}

export async function updateSpeakerTag(id: string, edit: SpeakerTagEdit): Promise<PublicSpeakerTag> {
    const speakerTag = await prisma.speakerTag.findFirst({
        where: { id },
        include: {
            speakerSegments: {
                take: 1,
            }
        }
    });

    if (!speakerTag || !speakerTag.speakerSegments[0]) {
        throw new Error('Speaker tag not found');
    }

    await withUserAuthorizedToEdit({ cityId: speakerTag.speakerSegments[0].cityId });
    // A server action receives whatever the browser sends, so only the two
    // editable fields are read from it. Any edit makes the tag the reviewer's:
    // a typed label says who the speaker is as much as a chosen person does,
    // and from then on no automatic pass reassigns it.
    const updatedSpeakerTag = await prisma.speakerTag.update({
        where: { id },
        data: {
            ...(edit.personId !== undefined ? { personId: edit.personId } : {}),
            ...(edit.label !== undefined ? { label: edit.label } : {}),
            personSetBy: 'user',
        },
        select: publicSpeakerTagSelect,
    });
    return updatedSpeakerTag;
}

export async function getSpeakerTagsForCityCouncilMeeting(cityCouncilMeetingId: string): Promise<PublicSpeakerTag[]> {
    const speakerTags = await prisma.speakerTag.findMany({
        where: {
            speakerSegments: {
                some: {
                    meetingId: cityCouncilMeetingId
                }
            }
        },
        orderBy: {
            createdAt: 'asc',
        },
        select: publicSpeakerTagSelect,
    });
    return speakerTags;
}

export async function assignSpeakerSegmentToNewSpeakerTag(speakerSegmentId: string) {
    const speakerSegment = await prisma.speakerSegment.findUnique({
        where: { id: speakerSegmentId },
        include: { speakerTag: true }
    });

    if (!speakerSegment) {
        throw new Error('Speaker segment not found');
    }

    await withUserAuthorizedToEdit({ cityId: speakerSegment.cityId });

    const newSpeakerTag = await prisma.speakerTag.create({
        data: {
            label: "New " + speakerSegment.speakerTag.label,
            speakerSegments: {
                connect: { id: speakerSegmentId }
            }
        },
        select: publicSpeakerTagSelect,
    });

    await prisma.speakerSegment.update({
        where: { id: speakerSegmentId },
        data: { speakerTagId: newSpeakerTag.id }
    });

    return newSpeakerTag;
}

export async function createEmptySpeakerSegmentAfter(
    afterSegmentId: string,
    speakerTagId: string,
    cityId: string,
    meetingId: string
) {
    await withUserAuthorizedToEdit({ cityId });
    // First get the segment we're inserting after to get its end timestamp
    const afterSegment = await prisma.speakerSegment.findUnique({
        where: { id: afterSegmentId },
        include: { utterances: true }
    });

    if (!afterSegment) {
        throw new Error('Segment not found');
    }

    // Create a new segment starting at the end of the previous one
    // We'll create it with a 10 second duration initially
    const startTimestamp = afterSegment.endTimestamp;
    const endTimestamp = startTimestamp + 10;

    // Create the new segment
    const newSegment = await prisma.speakerSegment.create({
        data: {
            startTimestamp,
            endTimestamp,
            cityId,
            meetingId,
            speakerTagId,
            // Create an initial empty utterance
            utterances: {
                create: {
                    startTimestamp,
                    endTimestamp,
                    text: '',
                    lastModifiedBy: 'user'
                }
            }
        },
        include: {
            utterances: true,
            speakerTag: {
                select: {
                    ...publicSpeakerTagSelect,
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

    return newSegment;
}