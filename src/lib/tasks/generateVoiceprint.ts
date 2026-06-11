"use server";

import prisma from "@/lib/db/prisma";
import { getCouncilMeeting } from "@/lib/db/meetings";
import { withUserAuthorizedToEdit } from "../auth";
import { startTask } from "./tasks";
import { GenerateVoiceprintRequest, GenerateVoiceprintResult } from "../apiTypes";
import { Prisma, SpeakerSegment } from "@prisma/client";
import { createVoicePrintDirect } from "@/lib/db/voiceprintsCreate";
import { VOICEPRINT_DURATION, computeVoiceprintWindow } from "@/lib/tasks/voiceprintWindow";

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
 * Build and dispatch a generateVoiceprint task for an explicit speaker segment.
 *
 * Shared by both the automatic (longest-segment) flow and the manual
 * segment-selection flow. Validates the segment is long enough, resolves the
 * meeting media URL, authorizes the caller for the segment's city, and computes
 * a VOICEPRINT_DURATION window centered on the segment midpoint.
 */
async function dispatchVoiceprintTaskForSegment(personId: string, segment: SpeakerSegment) {
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

    // Take a VOICEPRINT_DURATION window centered on the segment, clamped to its bounds
    const { startTimestamp, endTimestamp } = computeVoiceprintWindow(
        segment.startTimestamp,
        segment.endTimestamp,
    );

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
 * Request to generate a voiceprint for a person from a specific, manually
 * chosen speaker segment.
 *
 * This is the manual counterpart to {@link requestGenerateVoiceprint}: instead
 * of auto-picking the longest segment, the admin picks one of the candidate
 * segments returned by {@link getCandidateSegmentsForVoiceprint}.
 */
export async function requestGenerateVoiceprintForSegment(personId: string, segmentId: string) {
    const segment = await prisma.speakerSegment.findUnique({
        where: { id: segmentId },
        include: {
            speakerTag: {
                select: { personId: true },
            },
        },
    });

    if (!segment) {
        throw new Error("Speaker segment not found");
    }

    // Ensure the chosen segment actually belongs to this person
    if (segment.speakerTag.personId !== personId) {
        throw new Error("The selected segment does not belong to this person");
    }

    // dispatchVoiceprintTaskForSegment expects a plain SpeakerSegment; drop the
    // included relation before passing it through.
    const { speakerTag, ...plainSegment } = segment;
    void speakerTag;

    return dispatchVoiceprintTaskForSegment(personId, plainSegment);
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
export interface VoiceprintCandidateSegment {
    segmentId: string;
    meetingId: string;
    cityId: string;
    meetingName: string;
    meetingNameEn: string;
    meetingDate: string; // ISO string
    startTimestamp: number;
    endTimestamp: number;
    duration: number; // seconds
    mediaUrl: string | null; // meeting audio/video URL for audio preview, if available
    previewStartTimestamp: number; // start of the 30s window the voiceprint will use (seconds)
    previewEndTimestamp: number; // end of the 30s window the voiceprint will use (seconds)
    windowText: string; // transcript of the centered 30s window — what the admin actually hears
    fullText: string; // full transcript of the segment — shown on demand for fuller context
}

const MAX_VOICEPRINT_CANDIDATES = 5;

/**
 * Return the top candidate speaker segments for manual voiceprint selection.
 *
 * Candidates are segments belonging to the person that are at least
 * VOICEPRINT_DURATION long, sorted longest-first and capped at
 * MAX_VOICEPRINT_CANDIDATES. Each candidate carries enough metadata
 * (meeting, duration, transcript preview) for an admin to make an informed
 * choice in the UI.
 */
export async function getCandidateSegmentsForVoiceprint(personId: string): Promise<VoiceprintCandidateSegment[]> {
    const person = await prisma.person.findUnique({
        where: { id: personId },
        select: { cityId: true },
    });

    if (!person) {
        throw new Error("Person not found");
    }

    await withUserAuthorizedToEdit({ cityId: person.cityId });

    const segments = await prisma.speakerSegment.findMany({
        where: {
            speakerTag: { personId },
        },
        select: {
            id: true,
            meetingId: true,
            cityId: true,
            startTimestamp: true,
            endTimestamp: true,
            meeting: {
                select: { name: true, name_en: true, dateTime: true, audioUrl: true, videoUrl: true },
            },
            utterances: {
                orderBy: { startTimestamp: "asc" },
                select: { text: true, startTimestamp: true, endTimestamp: true },
            },
        },
    });

    return segments
        .map(segment => {
            const duration = segment.endTimestamp - segment.startTimestamp;

            // Same media URL the dispatch uses, so the admin previews exactly what
            // the voiceprint job will consume.
            const mediaUrl = segment.meeting.audioUrl || segment.meeting.videoUrl || null;
            const previewWindow = computeVoiceprintWindow(segment.startTimestamp, segment.endTimestamp);

            // windowText is the transcript of the centered 30s window the voiceprint
            // uses — i.e. what the admin hears in the audio preview, so they can read
            // along. fullText is the whole segment, shown on demand.
            const windowText = segment.utterances
                .filter(
                    u =>
                        u.startTimestamp < previewWindow.endTimestamp &&
                        u.endTimestamp > previewWindow.startTimestamp,
                )
                .map(u => u.text)
                .join(" ")
                .trim();
            const fullText = segment.utterances.map(u => u.text).join(" ").trim();

            return {
                segmentId: segment.id,
                meetingId: segment.meetingId,
                cityId: segment.cityId,
                meetingName: segment.meeting.name,
                meetingNameEn: segment.meeting.name_en,
                meetingDate: segment.meeting.dateTime.toISOString(),
                startTimestamp: segment.startTimestamp,
                endTimestamp: segment.endTimestamp,
                duration,
                mediaUrl,
                previewStartTimestamp: previewWindow.startTimestamp,
                previewEndTimestamp: previewWindow.endTimestamp,
                windowText,
                fullText,
            };
        })
        .filter(candidate => candidate.duration >= VOICEPRINT_DURATION)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, MAX_VOICEPRINT_CANDIDATES);
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
