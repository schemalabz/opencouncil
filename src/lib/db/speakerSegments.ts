"use server";
import prisma from './prisma';
import { withUserAuthorizedToEdit } from '../auth';
import { CouncilMeeting, City, SpeakerSegment, Utterance, SpeakerTag, TopicLabel, Topic, Summary, Prisma } from '@prisma/client';
import { PersonWithRelations } from './people';
import { isRoleActiveAt } from '../utils';

export type SegmentWithRelations = {
    id: string;
    startTimestamp: number;
    endTimestamp: number;
    meeting: CouncilMeeting & {
        city: City;
    };
    person: PersonWithRelations | null;
    text: string;
    summary: { text: string } | null;
};

const speakerSegmentWithRelationsInclude = {
    utterances: true,
    speakerTag: {
        include: {
            person: {
                include: {
                    roles: {
                        include: {
                            party: true,
                            city: true,
                            administrativeBody: true
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
} satisfies Prisma.SpeakerSegmentInclude;

export type SpeakerSegmentWithRelations = Prisma.SpeakerSegmentGetPayload<{ include: typeof speakerSegmentWithRelationsInclude }>;

// New interface for editable speaker segment data
export interface EditableSpeakerSegmentData {
    utterances: Array<{
        id: string;          // read-only for reference
        text: string;        // editable
        startTimestamp: number; // editable
        endTimestamp: number;   // editable
    }>;
    summary?: {
        text: string;        // editable
        type: 'procedural' | 'substantive'; // editable
    } | null;
}

export async function createEmptySpeakerSegmentAfter(
    afterSegmentId: string,
    cityId: string,
    meetingId: string
): Promise<SpeakerSegmentWithRelations> {
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

    await withUserAuthorizedToEdit({ cityId });

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
        include: speakerSegmentWithRelationsInclude
    });

    console.log(`Created a new speaker segment starting at ${startTimestamp} and ending at ${endTimestamp}. Previous segment ended at ${currentSegment.endTimestamp}, next segment starts at ${nextSegment?.startTimestamp}`);

    return newSegment;
}

export async function createEmptySpeakerSegmentBefore(
    beforeSegmentId: string,
    cityId: string,
    meetingId: string
): Promise<SpeakerSegmentWithRelations> {
    // First get the segment we're inserting before to get its start timestamp
    const firstSegment = await prisma.speakerSegment.findUnique({
        where: { id: beforeSegmentId },
        include: {
            utterances: true,
            speakerTag: true
        }
    });

    if (!firstSegment) {
        throw new Error('Segment not found');
    }

    await withUserAuthorizedToEdit({ cityId });

    // Calculate timestamps for the new segment
    // We want to create a small segment before the first segment
    const endTimestamp = firstSegment.startTimestamp - 0.01;
    const startTimestamp = Math.max(0, endTimestamp - 0.01);

    // If the first segment starts too close to 0, we need to adjust or throw an error
    if (startTimestamp < 0 || startTimestamp >= endTimestamp) {
        throw new Error('Cannot create segment before first segment: insufficient timestamp space');
    }

    // Create a new speaker tag
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
        include: speakerSegmentWithRelationsInclude
    });

    console.log(`Created a new speaker segment before first segment: ${startTimestamp} - ${endTimestamp}. First segment starts at ${firstSegment.startTimestamp}`);

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

    await withUserAuthorizedToEdit({ cityId: currentSegment.cityId });

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

export async function updateSegmentTimestamps(segmentId: string) {
    const segment = await prisma.speakerSegment.findUnique({
        where: { id: segmentId },
        include: { utterances: true }
    });

    if (!segment) {
        throw new Error('Segment not found');
    }

    await withUserAuthorizedToEdit({ cityId: segment.cityId });

    const earliestStart = Math.min(...segment.utterances.map(u => u.startTimestamp));
    const latestEnd = Math.max(...segment.utterances.map(u => u.endTimestamp));

    await prisma.speakerSegment.update({
        where: { id: segmentId },
        data: { startTimestamp: earliestStart, endTimestamp: latestEnd }
    });
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
        include: speakerSegmentWithRelationsInclude
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

    await withUserAuthorizedToEdit({ cityId });

    const text = segment.utterances.map((u) => u.text).join(" ");
    const isOnlyWhitespace = text.trim().length === 0;

    if (segment.utterances.length > 0 && !isOnlyWhitespace) {
        throw new Error('Cannot delete non-empty segment');
    }

    // Delete the segment and its speaker tag
    console.log(`Deleting segment ${segmentId}`);
    await prisma.speakerSegment.delete({
        where: { id: segmentId }
    })

    return segmentId;
}

export async function getLatestSegmentsForSpeaker(
    personId: string,
    page: number = 1,
    pageSize: number = 5,
    administrativeBodyId?: string | null,
    topicId?: string | null
): Promise<{ results: SegmentWithRelations[], totalCount: number }> {
    const skip = (page - 1) * pageSize;

    const whereClause: any = {
        speakerTag: {
            personId: personId
        },
        utterances: {
            some: {
                text: {
                    gt: ''
                }
            }
        },
        meeting: administrativeBodyId ? {
            administrativeBodyId: administrativeBodyId
        } : undefined
    };

    if (topicId) {
        whereClause.topicLabels = {
            some: {
                topicId: topicId
            }
        };
    }

    const [segments, totalCount] = await Promise.all([
        prisma.speakerSegment.findMany({
            where: whereClause,
            include: {
                meeting: {
                    include: {
                        city: true
                    }
                },
                speakerTag: {
                    include: {
                        person: {
                            include: {
                                roles: {
                                    include: {
                                        party: true,
                                        city: true,
                                        administrativeBody: true
                                    }
                                }
                            }
                        }
                    }
                },
                utterances: true,
                summary: true,
            },
            orderBy: [
                {
                    meeting: {
                        dateTime: 'desc'
                    }
                },
                {
                    startTimestamp: 'desc'
                }
            ],
            take: pageSize,
            skip
        }),
        prisma.speakerSegment.count({
            where: whereClause
        })
    ]);

    const results = segments
        .map(segment => ({
            id: segment.id,
            startTimestamp: segment.startTimestamp,
            endTimestamp: segment.endTimestamp,
            meeting: segment.meeting,
            person: segment.speakerTag?.person || null,
            text: segment.utterances.map(u => u.text).join(' '),
            summary: segment.summary ? { text: segment.summary.text } : null
        }))
        // Only include segments with at least 100 characters
        .filter(segment => segment.text.length >= 100);

    return {
        results,
        totalCount
    };
}

export async function getLatestSegmentsForParty(
    partyId: string,
    page: number = 1,
    pageSize: number = 5,
    administrativeBodyId?: string | null
): Promise<{ results: SegmentWithRelations[], totalCount: number }> {
    const skip = (page - 1) * pageSize;

    const [segments, totalCount] = await Promise.all([
        prisma.speakerSegment.findMany({
            where: {
                speakerTag: {
                    person: {
                        roles: {
                            some: {
                                partyId: partyId
                            }
                        }
                    }
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                meeting: administrativeBodyId ? {
                    administrativeBodyId: administrativeBodyId
                } : undefined
            },
            include: {
                meeting: {
                    include: {
                        city: true
                    }
                },
                speakerTag: {
                    include: {
                        person: {
                            include: {
                                roles: {
                                    where: {
                                        partyId: partyId
                                    },
                                    include: {
                                        party: true,
                                        city: true,
                                        administrativeBody: true
                                    }
                                }
                            }
                        }
                    }
                },
                utterances: true,
                summary: true,
            },
            orderBy: [
                {
                    meeting: {
                        dateTime: 'desc'
                    }
                },
                {
                    startTimestamp: 'desc'
                }
            ],
            take: pageSize,
            skip
        }),
        prisma.speakerSegment.count({
            where: {
                speakerTag: {
                    person: {
                        roles: {
                            some: {
                                partyId: partyId
                            }
                        }
                    }
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                meeting: administrativeBodyId ? {
                    administrativeBodyId: administrativeBodyId
                } : undefined
            }
        })
    ]);

    const results = segments
        .filter(segment => {
            // Safely check for minimum text length
            const text = segment.utterances.map(u => u.text).join(' ');
            // Safe check for person and roles
            const hasPerson = segment.speakerTag?.person != null;
            const hasRoles = Array.isArray(segment.speakerTag?.person?.roles);
            // Only include segments with at least 100 characters and a person with roles
            return text.length >= 100 && hasPerson && hasRoles;
        })
        .flatMap(segment => {
            const text = segment.utterances.map(u => u.text).join(' ');
            const person = segment.speakerTag?.person;

            // At this point we know person exists thanks to our filter
            // But TypeScript might not recognize this, so we add a safety check
            if (!person || !Array.isArray(person.roles)) {
                return [];
            }

            const meetingDate = new Date(segment.meeting.dateTime);

            // Check for active role at meeting time
            const hasActiveRole = person.roles.some(role => isRoleActiveAt(role, meetingDate));


            // Skip if no active role
            if (!hasActiveRole) {
                return [];
            }

            return [{
                id: segment.id,
                startTimestamp: segment.startTimestamp,
                endTimestamp: segment.endTimestamp,
                meeting: segment.meeting,
                person: person,
                text: text,
                summary: segment.summary ? { text: segment.summary.text } : null
            }];
        });

    return {
        results,
        totalCount
    };
}

export async function updateSpeakerSegmentData(
    segmentId: string,
    data: EditableSpeakerSegmentData,
    cityId: string
): Promise<SpeakerSegmentWithRelations> {
    // Get the current segment to verify ownership and get current state
    const currentSegment = await prisma.speakerSegment.findUnique({
        where: { id: segmentId },
        include: {
            utterances: true,
            summary: true
        }
    });

    if (!currentSegment) {
        throw new Error('Speaker segment not found');
    }

    if (currentSegment.cityId !== cityId) {
        throw new Error('City ID mismatch');
    }

    await withUserAuthorizedToEdit({ cityId });

    // Validate the input data
    if (data.utterances.length === 0) {
        throw new Error('At least one utterance must remain');
    }

    // Validate utterance timestamps
    for (const utterance of data.utterances) {
        if (utterance.startTimestamp >= utterance.endTimestamp) {
            throw new Error(`Invalid timestamps for utterance ${utterance.id}: start must be less than end`);
        }
    }

    // Validate summary if provided
    if (data.summary && (!data.summary.text || data.summary.text.trim().length === 0)) {
        throw new Error('Summary text cannot be empty if summary is provided');
    }

    return await prisma.$transaction(async (prisma) => {
        // Get existing utterance IDs for comparison
        const existingUtteranceIds = new Set(currentSegment.utterances.map(u => u.id));
        const newUtteranceIds = new Set(data.utterances.map(u => u.id));

        // Find utterances to delete (in existing but not in new)
        const utterancesToDelete = Array.from(existingUtteranceIds).filter(id => !newUtteranceIds.has(id));

        // Delete removed utterances
        if (utterancesToDelete.length > 0) {
            await prisma.utterance.deleteMany({
                where: { id: { in: utterancesToDelete } }
            });
        }

        // Update existing utterances and create new ones
        for (const utteranceData of data.utterances) {
            if (existingUtteranceIds.has(utteranceData.id)) {
                // Update existing utterance
                await prisma.utterance.update({
                    where: { id: utteranceData.id },
                    data: {
                        text: utteranceData.text,
                        startTimestamp: utteranceData.startTimestamp,
                        endTimestamp: utteranceData.endTimestamp
                    }
                });
            } else if (utteranceData.id.startsWith('temp_')) {
                // Create new utterance (temporary ID indicates a new utterance)
                await prisma.utterance.create({
                    data: {
                        text: utteranceData.text || '',
                        startTimestamp: utteranceData.startTimestamp,
                        endTimestamp: utteranceData.endTimestamp,
                        speakerSegmentId: segmentId
                    }
                });
            }
        }

        // Calculate new segment timestamps based on utterances
        const allTimestamps = data.utterances.flatMap(u => [u.startTimestamp, u.endTimestamp]);
        const newSegmentStart = Math.min(...allTimestamps);
        const newSegmentEnd = Math.max(...allTimestamps);

        // Update or delete summary
        if (data.summary) {
            await prisma.summary.upsert({
                where: { speakerSegmentId: segmentId },
                update: {
                    text: data.summary.text,
                    type: data.summary.type
                },
                create: {
                    text: data.summary.text,
                    type: data.summary.type,
                    speakerSegmentId: segmentId
                }
            });
        } else if (currentSegment.summary) {
            // Delete summary if it exists but wasn't provided in the update
            await prisma.summary.delete({
                where: { speakerSegmentId: segmentId }
            });
        }

        // Update segment timestamps
        await prisma.speakerSegment.update({
            where: { id: segmentId },
            data: {
                startTimestamp: newSegmentStart,
                endTimestamp: newSegmentEnd
            }
        });

        // Return the updated segment with all relations
        const updatedSegment = await prisma.speakerSegment.findUnique({
            where: { id: segmentId },
            include: speakerSegmentWithRelationsInclude
        });

        if (!updatedSegment) {
            throw new Error('Failed to retrieve updated segment');
        }

        return updatedSegment;
    });
}