"use server";

import prisma from "@/lib/db/prisma";
import { dispatchVoiceprintTaskForSegment } from "@/lib/tasks/voiceprintRequests";
import { withUserAuthorizedToEdit } from "../auth";
import { GenerateVoiceprintRequest, GenerateVoiceprintResult } from "../apiTypes";
import { Prisma, SpeakerSegment } from "@prisma/client";
import { createVoicePrintDirect } from "@/lib/db/voiceprintsCreate";
import { VOICEPRINT_DURATION } from "@/lib/tasks/voiceprintWindow";

/**
 * A person's speaker tags, with what decides whether their audio may become the
 * person's voiceprint: the completed reviews of each segment's meeting.
 */
const voiceprintCandidateTagInclude = {
    speakerSegments: {
        include: {
            meeting: {
                select: {
                    taskStatuses: {
                        where: { type: 'humanReview', status: 'succeeded' },
                        select: { createdAt: true },
                    },
                },
            },
        },
    },
} satisfies Prisma.SpeakerTagInclude;

type VoiceprintCandidateTag = Prisma.SpeakerTagGetPayload<{ include: typeof voiceprintCandidateTagInclude }>;

/**
 * Whether a tag's audio may become its person's voiceprint.
 *
 * A name only the transcript gave is unreviewed, and a voiceprint built on a
 * wrong one would make the voiceprint method repeat the transcript's mistake in
 * every later meeting. Such a tag counts once the review of its meeting is
 * complete: the reviewer read the name and left it, which is how a reviewer
 * confirms one.
 *
 * The review must be later than the tag. A re-transcribe replaces every tag,
 * and a review of the earlier transcript says nothing about the new ones.
 */
function isVoiceprintSource(tag: VoiceprintCandidateTag): boolean {
    if (tag.personSetBy !== 'transcript') return true;
    return tag.speakerSegments.some(segment =>
        segment.meeting.taskStatuses.some(review => review.createdAt > tag.createdAt)
    );
}

/** The segments a person's voiceprint may be cut from, without the review data they were chosen by. */
function voiceprintSourceSegments(tags: VoiceprintCandidateTag[]): SpeakerSegment[] {
    return tags
        .filter(isVoiceprintSource)
        .flatMap(tag => tag.speakerSegments.map(({ meeting: _meeting, ...segment }) => segment));
}

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
