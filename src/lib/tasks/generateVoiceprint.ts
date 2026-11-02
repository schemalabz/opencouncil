"use server";

import prisma from "@/lib/db/prisma";
import { dispatchVoiceprintTaskForSegment } from "@/lib/tasks/voiceprintRequests";
import { withUserAuthorizedToEdit } from "../auth";
import { GenerateVoiceprintRequest, GenerateVoiceprintResult } from "../apiTypes";
import { SpeakerSegment } from "@prisma/client";
import { createVoicePrintDirect } from "@/lib/db/voiceprintsCreate";
import { voiceprintCandidateTagInclude, voiceprintSourceSegments } from "@/lib/db/voiceprintCandidates";
import { VOICEPRINT_DURATION } from "@/lib/tasks/voiceprintWindow";

/**
 * Find the people of a city who are eligible for voiceprint generation: all of
 * them, or only those in `personIds`. Eligible means: they have at least one
 * speaker segment longer than VOICEPRINT_DURATION and they don't already have
 * a voiceprint. The query loads every segment of the people it reads, so pass
 * the ids whenever the caller has them.
 */
export async function findEligiblePeopleForVoiceprintGeneration(cityId: string, personIds?: string[]): Promise<{
    eligiblePeople: Array<{ id: string; name: string }>;
    count: number;
}> {
    await withUserAuthorizedToEdit({ cityId });
    // A server action has no runtime types: check what the browser sent.
    if (personIds !== undefined && !(Array.isArray(personIds) && personIds.every(id => typeof id === "string"))) {
        throw new Error("personIds must be an array of strings");
    }

    // First, get the people in this city who don't have voiceprints
    const peopleWithoutVoiceprints = await prisma.person.findMany({
        where: {
            cityId,
            ...(personIds && { id: { in: personIds } }),
            voicePrints: {
                none: {}
            }
        },
        select: {
            id: true,
            name: true,
            speakerTags: {
                include: voiceprintCandidateTagInclude
            }
        }
    });

    // Filter to only those with a usable segment longer than VOICEPRINT_DURATION
    const eligiblePeople = peopleWithoutVoiceprints.filter(person =>
        voiceprintSourceSegments(person.speakerTags).some(segment =>
            segment.endTimestamp - segment.startTimestamp >= VOICEPRINT_DURATION
        )
    );

    return {
        eligiblePeople: eligiblePeople.map(person => ({ id: person.id, name: person.name })),
        count: eligiblePeople.length
    };
}

/**
 * Request to generate voiceprints for the eligible people of a city: all of
 * them, or only those in `personIds`. An id that is not eligible is skipped,
 * so a page that went stale cannot ask for more than the rule allows.
 */
export async function requestGenerateVoiceprintsForCity(cityId: string, personIds?: string[]) {
    await withUserAuthorizedToEdit({ cityId });

    const { eligiblePeople } = await findEligiblePeopleForVoiceprintGeneration(cityId, personIds);

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
 * Request to generate a voiceprint for a person, automatically selecting the
 * longest available speaker segment.
 */
export async function requestGenerateVoiceprint(personId: string) {
    // Find the longest speaker segment for this person
    const segment = await findLongestSpeakerSegmentForPerson(personId);

    if (!segment) {
        throw new Error("No speaker segments found for this person");
    }

    return dispatchVoiceprintTaskForSegment(personId, segment);
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
                    include: voiceprintCandidateTagInclude,
                },
            },
        });

        if (!person) {
            return null;
        }

        // Every segment of the tags whose audio may be used
        const allSegments = voiceprintSourceSegments(person.speakerTags);

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
 * A speaker segment that is eligible to be used as the source for a voiceprint,
 * enriched with the metadata an admin needs to choose between candidates.
 */
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
        await createVoicePrintDirect({
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
