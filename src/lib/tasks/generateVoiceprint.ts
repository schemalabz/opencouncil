"use server";

import prisma from "@/lib/db/prisma";
import { getCouncilMeeting } from "@/lib/db/meetings";
import { withUserAuthorizedToEdit } from "../auth";
import { startTask } from "./tasks";
import { GenerateVoiceprintRequest, GenerateVoiceprintResult } from "../apiTypes";
import { Prisma, SpeakerSegment } from "@prisma/client";
import { createVoicePrintDirect } from "@/lib/db/voiceprintsCreate";

const VOICEPRINT_DURATION = 30;

/**
 * A person's speaker tags, with what decides whether their audio may become the
 * person's voiceprint: the completed reviews of each segment's meeting.
 */
const voiceprintCandidateTagInclude = {
    // Whether the voice itself vouches for the name: a voiceprint opinion on the same person.
    identifications: {
        where: { method: 'voiceprint' },
        select: { personId: true },
    },
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
 * A name that no voice vouches for is unreviewed, and a voiceprint built on a
 * wrong one would make the voiceprint method repeat that mistake in every
 * later meeting. Those are the names the transcript or the municipal minutes
 * gave on their own, and a `both` where they agreed with each other but no
 * voiceprint opinion names the person (#876). Such a tag counts once the human
 * review of its meeting is complete: the reviewer read the name and left it,
 * which is how a reviewer confirms one. A correction from the minutes stands
 * in for the review elsewhere, never here, so a backfilled meeting feeds no
 * voiceprint until a person reviews it.
 *
 * The review must be later than the tag. A re-transcribe replaces every tag,
 * and a review of the earlier transcript says nothing about the new ones.
 */
function isVoiceprintSource(tag: VoiceprintCandidateTag): boolean {
    if (!voiceIsUnconfirmed(tag)) return true;
    return tag.speakerSegments.some(segment =>
        segment.meeting.taskStatuses.some(review => review.createdAt > tag.createdAt)
    );
}

/** The tag's person rests on text alone: no reviewer set it and no voiceprint opinion names them. */
function voiceIsUnconfirmed(tag: VoiceprintCandidateTag): boolean {
    switch (tag.personSetBy) {
        case 'transcript':
        case 'minutes':
            return true;
        case 'both':
            return !tag.identifications.some(identification => identification.personId === tag.personId);
        default:
            return false;
    }
}

/** The segments a person's voiceprint may be cut from, without the review data they were chosen by. */
function voiceprintSourceSegments(tags: VoiceprintCandidateTag[]): SpeakerSegment[] {
    return tags
        .filter(isVoiceprintSource)
        .flatMap(tag => tag.speakerSegments.map(({ meeting: _meeting, ...segment }) => segment));
}

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
