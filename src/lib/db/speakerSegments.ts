"use server";
import prisma from './prisma';
import { withUserAuthorizedToEdit } from '../auth';

export async function createEmptySpeakerSegmentAfter(
    afterSegmentId: string,
    cityId: string,
    meetingId: string
) {
    // First get the segment we're inserting after to get its end timestamp and speaker tag info
    const currentSegment = await prisma.speakerSegment.findUnique({
        where: { id: afterSegmentId },
        include: {
            utterances: true,
            speakerTag: true
        }
    });

    if (!currentSegment) {
        throw new Error('Segment not found');
    }

    withUserAuthorizedToEdit({ cityId });

    // Find the next segment to ensure we place the new segment correctly
    const nextSegment = await prisma.speakerSegment.findFirst({
        where: {
            meetingId,
            cityId,
            startTimestamp: { gt: currentSegment.endTimestamp }
        },
        orderBy: { startTimestamp: 'asc' }
    });

    // Create a new segment starting at the end of the previous one
    const startTimestamp = currentSegment.endTimestamp + 0.01; // ugh
    const endTimestamp = nextSegment
        ? Math.min(startTimestamp + 0.01, nextSegment.startTimestamp)
        : startTimestamp + 0.01;

    // Create a new speaker tag based on the previous one
    const newSpeakerTag = await prisma.speakerTag.create({
        data: {
            label: "New speaker segment",
            personId: null // Reset the person association for the new tag
        }
    });

    // Create the new segment
    const newSegment = await prisma.speakerSegment.create({
        data: {
            startTimestamp,
            endTimestamp,
            cityId,
            meetingId,
            speakerTagId: newSpeakerTag.id
        },
        include: {
            utterances: true,
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

    console.log(`Created a new speaker segment starting at ${startTimestamp} and ending at ${endTimestamp}. Previous segment ended at ${currentSegment.endTimestamp}, next segment starts at ${nextSegment?.startTimestamp}`);

    /*
    // If there's a next segment, we need to ensure its start time is after our new segment
    if (nextSegment && nextSegment.startTimestamp <= endTimestamp) {
        await prisma.speakerSegment.update({
            where: { id: nextSegment.id },
            data: { startTimestamp: endTimestamp + 1 }
        });
    }
    */

    return newSegment;
}

async function moveUtterancesToSegment(
    utteranceId: string,
    currentSegmentId: string,
    direction: 'previous' | 'next'
) {
    // Get the current segment and its utterances
    const currentSegment = await prisma.speakerSegment.findUnique({
        where: { id: currentSegmentId },
        include: {
            utterances: {
                orderBy: { startTimestamp: 'asc' }
            }
        }
    });

    if (!currentSegment) {
        throw new Error('Current segment not found');
    }

    withUserAuthorizedToEdit({ cityId: currentSegment.cityId });

    // Find the target segment (previous or next)
    const targetSegment = await prisma.speakerSegment.findFirst({
        where: {
            meetingId: currentSegment.meetingId,
            cityId: currentSegment.cityId,
            ...(direction === 'previous'
                ? { endTimestamp: { lt: currentSegment.startTimestamp } }
                : { startTimestamp: { gt: currentSegment.endTimestamp } }
            )
        },
        orderBy: direction === 'previous'
            ? { endTimestamp: 'desc' }
            : { startTimestamp: 'asc' },
        include: {
            utterances: {
                orderBy: { startTimestamp: 'asc' }
            }
        }
    });

    if (!targetSegment) {
        throw new Error(`No ${direction} segment found`);
    }

    // Find the index of the target utterance
    const utteranceIndex = currentSegment.utterances.findIndex(u => u.id === utteranceId);
    if (utteranceIndex === -1) {
        throw new Error('Utterance not found in segment');
    }

    // Get utterances to move and remaining utterances
    const [utterancesToMove, remainingUtterances] = direction === 'previous'
        ? [
            currentSegment.utterances.slice(0, utteranceIndex + 1),
            currentSegment.utterances.slice(utteranceIndex + 1)
        ]
        : [
            currentSegment.utterances.slice(utteranceIndex),
            currentSegment.utterances.slice(0, utteranceIndex)
        ];

    // Update the segments and move the utterances
    await prisma.$transaction([
        // Move utterances to target segment
        prisma.utterance.updateMany({
            where: { id: { in: utterancesToMove.map(u => u.id) } },
            data: { speakerSegmentId: targetSegment.id }
        }),
        // Update target segment's timestamp
        prisma.speakerSegment.update({
            where: { id: targetSegment.id },
            data: targetSegment.utterances.length === 0
                ? direction === 'previous'
                    ? {
                        startTimestamp: utterancesToMove[0].startTimestamp,
                        endTimestamp: utterancesToMove[utterancesToMove.length - 1].endTimestamp
                    }
                    : {
                        startTimestamp: utterancesToMove[0].startTimestamp,
                        endTimestamp: utterancesToMove[utterancesToMove.length - 1].endTimestamp
                    }
                : direction === 'previous'
                    ? { endTimestamp: utterancesToMove[utterancesToMove.length - 1].endTimestamp }
                    : { startTimestamp: utterancesToMove[0].startTimestamp }
        }),
        // Update current segment's timestamp
        prisma.speakerSegment.update({
            where: { id: currentSegment.id },
            data: remainingUtterances.length === 0
                ? direction === 'previous'
                    ? { startTimestamp: currentSegment.startTimestamp, endTimestamp: currentSegment.startTimestamp + 0.01 }
                    : { startTimestamp: currentSegment.endTimestamp - 0.01, endTimestamp: currentSegment.endTimestamp }
                : direction === 'previous'
                    ? { startTimestamp: remainingUtterances[0].startTimestamp }
                    : { endTimestamp: remainingUtterances[remainingUtterances.length - 1].endTimestamp }
        })
    ]);

    const updatedSegments = await Promise.all([
        getSegmentWithIncludes(currentSegment.id),
        getSegmentWithIncludes(targetSegment.id)
    ]);

    return direction === 'previous'
        ? { previousSegment: updatedSegments[1], currentSegment: updatedSegments[0] }
        : { currentSegment: updatedSegments[0], nextSegment: updatedSegments[1] };
}

export async function moveUtterancesToPreviousSegment(
    utteranceId: string,
    currentSegmentId: string,
) {
    return moveUtterancesToSegment(utteranceId, currentSegmentId, 'previous');
}

export async function moveUtterancesToNextSegment(
    utteranceId: string,
    currentSegmentId: string,
) {
    return moveUtterancesToSegment(utteranceId, currentSegmentId, 'next');
}

async function getSegmentWithIncludes(segmentId: string) {
    return await prisma.speakerSegment.findUnique({
        where: { id: segmentId },
        include: {
            utterances: true,
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
}

export async function deleteEmptySpeakerSegment(
    segmentId: string,
    cityId: string
) {
    // Get the segment and verify it's empty
    const segment = await prisma.speakerSegment.findUnique({
        where: { id: segmentId },
        include: {
            utterances: true,
            speakerTag: true
        }
    });

    if (!segment) {
        throw new Error('Segment not found');
    }

    if (segment.cityId !== cityId) {
        throw new Error('City ID mismatch');
    }

    withUserAuthorizedToEdit({ cityId });

    if (segment.utterances.length > 0) {
        throw new Error('Cannot delete non-empty segment');
    }

    // Delete the segment and its speaker tag
    console.log(`Deleting segment ${segmentId}`);
    await prisma.speakerSegment.delete({
        where: { id: segmentId }
    })

    return segmentId;
} 
