"use server";

import prisma from "@/lib/db/prisma";
import { getCouncilMeeting } from "@/lib/db/meetings";
import { withUserAuthorizedToEdit } from "../auth";
import { startTask } from "./tasks";
import { GenerateVoiceprintRequest, GenerateVoiceprintResult } from "../apiTypes";
import { SpeakerSegment } from "@prisma/client";
import { createVoicePrint } from "@/lib/db/voiceprints";

const VOICEPRINT_DURATION = 30;

/**
 * Find all people in a city who are eligible for voiceprint generation
 * Eligible means: they have at least one speaker segment longer than VOICEPRINT_DURATION
 * and they don't already have a voiceprint
 */
export async function findEligiblePeopleForVoiceprintGeneration(cityId: string): Promise<{
    eligiblePeople: Array<{ id: string; name: string }>;
    count: number;
}> {
    await withUserAuthorizedToEdit({ cityId });

    // First, get all people in this city who don't have voiceprints
    const peopleWithoutVoiceprints = await prisma.person.findMany({
        where: {
            cityId,
            voicePrints: {
                none: {}
            }
        },
        select: {
            id: true,
            name: true,
            speakerTags: {
                include: {
                    speakerSegments: true
                }
            }
        }
    });

    // Filter to only those with segments longer than VOICEPRINT_DURATION
    const eligiblePeople = peopleWithoutVoiceprints.filter(person => {
        // Flatten all segments from all speaker tags
        const allSegments: SpeakerSegment[] = [];
        for (const tag of person.speakerTags) {
            allSegments.push(...tag.speakerSegments);
        }

        // Check if any segment is long enough
        return allSegments.some(segment =>
            segment.endTimestamp - segment.startTimestamp >= VOICEPRINT_DURATION
        );
    });

    return {
        eligiblePeople: eligiblePeople.map(person => ({ id: person.id, name: person.name })),
        count: eligiblePeople.length
    };
}

/**
 * Request to generate voiceprints for all eligible people in a city
 */
export async function requestGenerateVoiceprintsForCity(cityId: string) {
    await withUserAuthorizedToEdit({ cityId });

    const { eligiblePeople } = await findEligiblePeopleForVoiceprintGeneration(cityId);

    if (eligiblePeople.length === 0) {
        throw new Error("No eligible people found for voiceprint generation");
    }

    const results = [];
    const errors = [];

    // Process each eligible person
    for (const person of eligiblePeople) {
        try {
            const task = await requestGenerateVoiceprint(person.id);
            results.push({
                personId: person.id,
                personName: person.name,
                taskId: task.id,
                status: 'pending'
            });
        } catch (error) {
            errors.push({
                personId: person.id,
                personName: person.name,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    return {
        results,
        errors,
        totalRequested: eligiblePeople.length,
        successful: results.length,
        failed: errors.length
    };
}

/**
 * Request to generate a voiceprint for a person
 */
export async function requestGenerateVoiceprint(personId: string) {
    // Find the longest speaker segment for this person
    const segment = await findLongestSpeakerSegmentForPerson(personId);

    if (!segment) {
        throw new Error("No speaker segments found for this person");
    }

    // Check if the segment is long enough for a voiceprint
    const segmentDuration = segment.endTimestamp - segment.startTimestamp;
    if (segmentDuration < VOICEPRINT_DURATION) {
        throw new Error(
            `Speaker segment is too short (${segmentDuration.toFixed(1)}s). At least ${VOICEPRINT_DURATION}s of audio is required for a voiceprint.`,
        );
    }

    // Get meeting details
    const meeting = await getCouncilMeeting(segment.cityId, segment.meetingId);

    if (!meeting) {
        throw new Error("Meeting not found");
    }

    await withUserAuthorizedToEdit({ cityId: segment.cityId });

    const mediaUrl = meeting.audioUrl || meeting.videoUrl;
    if (!mediaUrl) {
        throw new Error("Meeting media URL not found");
    }

    // Calculate a segment centered on the midpoint
    const segmentMidpoint = segment.startTimestamp + segmentDuration / 2;

    // Take VOICEPRINT_DURATION seconds centered on the midpoint, ensuring we stay within segment bounds
    const halfDuration = VOICEPRINT_DURATION / 2;
    const startTimestamp = Math.max(segment.startTimestamp, segmentMidpoint - halfDuration);
    const endTimestamp = Math.min(segment.endTimestamp, startTimestamp + VOICEPRINT_DURATION);

    // Create the request
    const request: Omit<GenerateVoiceprintRequest, "callbackUrl"> = {
        mediaUrl,
        personId,
        segmentId: segment.id,
        startTimestamp,
        endTimestamp,
        cityId: segment.cityId,
    };

    return startTask("generateVoiceprint", request, segment.meetingId, segment.cityId);
}

/**
 * Find the longest speaker segment for a given person
 */
export async function findLongestSpeakerSegmentForPerson(personId: string): Promise<SpeakerSegment | null> {
    try {
        const person = await prisma.person.findUnique({
            where: { id: personId },
            include: {
                speakerTags: {
                    include: {
                        speakerSegments: true,
                    },
                },
            },
        });

        if (!person || person.speakerTags.length === 0) {
            return null;
        }

        // Collect all speaker segments from all speakerTags
        const allSegments: SpeakerSegment[] = [];
        for (const tag of person.speakerTags) {
            allSegments.push(...tag.speakerSegments);
        }

        if (allSegments.length === 0) {
            return null;
        }

        // Find the longest segment based on duration (endTimestamp - startTimestamp)
        const longestSegment = allSegments.reduce((longest, current) => {
            const currentDuration = current.endTimestamp - current.startTimestamp;
            const longestDuration = longest.endTimestamp - longest.startTimestamp;
            return currentDuration > longestDuration ? current : longest;
        }, allSegments[0]);

        return longestSegment;
    } catch (error) {
        console.error("Error finding longest speaker segment:", error);
        return null;
    }
}

/**
 * Handle the result of a generate voiceprint task
 */
export async function handleGenerateVoiceprintResult(taskId: string, result: GenerateVoiceprintResult): Promise<void> {
    const taskStatus = await prisma.taskStatus.findUnique({
        where: { id: taskId },
    });

    if (!taskStatus) {
        throw new Error("Task status not found");
    }

    const requestBody = JSON.parse(taskStatus.requestBody);

    try {
        await createVoicePrint({
            personId: requestBody.personId,
            sourceSegmentId: requestBody.segmentId,
            startTimestamp: requestBody.startTimestamp,
            endTimestamp: requestBody.endTimestamp,
            sourceAudioUrl: result.audioUrl,
            embedding: result.voiceprint,
        });
    } catch (error) {
        console.error("Error creating voiceprint:", error);
    }
}
