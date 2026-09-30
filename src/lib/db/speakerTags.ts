"use server";
import { SpeakerTag, Person } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from '../auth';

export async function getSpeakerTag(id: string): Promise<(SpeakerTag & { person: Person | null }) | null> {
    const speakerTag = await prisma.speakerTag.findUnique({
        where: { id },
        include: {
            person: true,
            speakerSegments: true,
        }
    });
    return speakerTag;
}

export async function getSpeakerTagsForCityCouncilMeeting(cityCouncilMeetingId: string): Promise<SpeakerTag[]> {
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
    });
    return speakerTags;
}

/** Who speaks: a person, or no person (then the tag shows its label). Without a label, the tag keeps the label it has. */
export type SpeakerAssignment = { personId: string | null; label?: string };

/**
 * `allSegments` changes the segment's speaker tag, so every segment that shares
 * the tag changes. `thisSegment` moves the segment to a new tag, so the other
 * segments keep the old one.
 */
export type SpeakerAssignmentScope = 'allSegments' | 'thisSegment';

/**
 * Sets who speaks in a segment: the write behind the transcript editor's
 * speaker picker. The segment keeps its id in both scopes, so its summary,
 * topic labels and voiceprints stay attached.
 *
 * Returns the speaker tag the segment has after the change.
 */
export async function assignSpeaker(
    speakerSegmentId: string,
    { personId, label }: SpeakerAssignment,
    scope: SpeakerAssignmentScope
): Promise<SpeakerTag> {
    const speakerSegment = await prisma.speakerSegment.findUnique({
        where: { id: speakerSegmentId },
        include: { speakerTag: true }
    });

    if (!speakerSegment) {
        throw new Error('Speaker segment not found');
    }

    await withUserAuthorizedToEdit({ cityId: speakerSegment.cityId });

    if (scope === 'allSegments') {
        return prisma.speakerTag.update({
            where: { id: speakerSegment.speakerTagId },
            data: { personId, ...(label !== undefined && { label }) }
        });
    }

    return prisma.speakerTag.create({
        data: {
            label: label ?? speakerSegment.speakerTag.label,
            personId,
            speakerSegments: {
                connect: { id: speakerSegmentId }
            }
        }
    });
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

    return newSegment;
}