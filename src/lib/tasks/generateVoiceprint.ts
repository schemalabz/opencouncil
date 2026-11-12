import "server-only";

import prisma from "@/lib/db/prisma";
import { getCouncilMeeting } from "@/lib/db/meetings";
import { withUserAuthorizedToEdit } from "../auth";
import { startTask } from "./tasks";
import { GenerateVoiceprintRequest } from "../apiTypes";
import { Prisma, SpeakerSegment, TaskStatus } from "@prisma/client";
import { BadRequestError } from "@/lib/api/errors";
import { hasVoicePrintConsent, voicePrintConsentInForce } from "@/lib/db/voicePrintConsentRule";

const VOICEPRINT_DURATION = 30;

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
 * them, or only those in `personIds`. Eligible means: their voiceprint consent
 * is in force, they have at least one speaker segment longer than
 * VOICEPRINT_DURATION, and they don't already have a voiceprint. The query
 * loads every segment of the people it reads, so pass the ids whenever the
 * caller has them.
 *
 * The voiceprint actions are a superadmin's, as the people page that calls
 * them: the answer tells whether a person consented, and consent is not
 * public.
 */
export async function findEligiblePeopleForVoiceprintGeneration(cityId: string, personIds?: string[]): Promise<{
    eligiblePeople: Array<{ id: string; name: string }>;
    count: number;
}> {
    await withUserAuthorizedToEdit({});
    // A server action has no runtime types: check what the browser sent.
    if (personIds !== undefined && !(Array.isArray(personIds) && personIds.every(id => typeof id === "string"))) {
        throw new Error("personIds must be an array of strings");
    }

    // First, get the people in this city who don't have voiceprints and whose consent is in force
    const peopleWithoutVoiceprints = await prisma.person.findMany({
        where: {
            cityId,
            ...(personIds && { id: { in: personIds } }),
            ...voicePrintConsentInForce,
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
    await withUserAuthorizedToEdit({});

    const { eligiblePeople } = await findEligiblePeopleForVoiceprintGeneration(cityId, personIds);

    const results = [];
    const errors = [];

    // Process each eligible person. The list above already holds only people
    // of this city with a consent in force, so each one starts directly.
    for (const person of eligiblePeople) {
        try {
            const task = await startVoiceprintGeneration(person.id);
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
 * Request to generate a voiceprint for a person. A superadmin's action (see
 * findEligiblePeopleForVoiceprintGeneration), authorized before it reads
 * anything. A refusal comes back as a value: production Next hides the
 * message of an error that a Server Action throws.
 */
export async function requestGenerateVoiceprint(personId: string): Promise<{ ok: true; task: TaskStatus } | { ok: false; message: string }> {
    await withUserAuthorizedToEdit({});

    if (!await prisma.person.findUnique({ where: { id: personId }, select: { id: true } })) {
        return { ok: false, message: "Person not found" };
    }
    if (!await hasVoicePrintConsent(personId)) {
        return { ok: false, message: "This person has no voiceprint consent in force. No voiceprint is generated or used without one." };
    }

    try {
        return { ok: true, task: await startVoiceprintGeneration(personId) };
    } catch (error) {
        if (error instanceof BadRequestError) return { ok: false, message: error.message };
        throw error;
    }
}

/**
 * Start the voiceprint task for a person from their longest source. The caller
 * has authorized and checked the consent.
 */
async function startVoiceprintGeneration(personId: string) {
    const [segment] = await findVoiceprintSources(personId);

    if (!segment) {
        throw new BadRequestError("No speaker segments found for this person");
    }

    return startVoiceprintTask(personId, segment);
}

/** Start the voiceprint task for a segment. The caller has authorized and checked the consent. */
async function startVoiceprintTask(personId: string, segment: SpeakerSegment) {
    // Check if the segment is long enough for a voiceprint
    const segmentDuration = segment.endTimestamp - segment.startTimestamp;
    if (segmentDuration < VOICEPRINT_DURATION) {
        throw new BadRequestError(
            `Speaker segment is too short (${segmentDuration.toFixed(1)}s). At least ${VOICEPRINT_DURATION}s of audio is required for a voiceprint.`,
        );
    }

    // Get meeting details
    const meeting = await getCouncilMeeting(segment.cityId, segment.meetingId);

    if (!meeting) {
        throw new BadRequestError("Meeting not found");
    }

    const mediaUrl = voiceprintMediaUrl(meeting);
    if (!mediaUrl) {
        throw new BadRequestError("The meeting has no media to cut a voiceprint from");
    }

    // Create the request
    const request: Omit<GenerateVoiceprintRequest, "callbackUrl"> = {
        mediaUrl,
        personId,
        segmentId: segment.id,
        ...voiceprintWindow(segment),
        cityId: segment.cityId,
    };

    return startTask("generateVoiceprint", request, segment.meetingId, segment.cityId);
}

/** The media a voiceprint is cut from. */
function voiceprintMediaUrl(meeting: { audioUrl: string | null; videoUrl: string | null }): string | null {
    return meeting.audioUrl || meeting.videoUrl;
}

/**
 * The VOICEPRINT_DURATION seconds at the middle of a segment: what the
 * voiceprint is cut from.
 */
function voiceprintWindow(segment: Pick<SpeakerSegment, "startTimestamp" | "endTimestamp">) {
    const midpoint = (segment.startTimestamp + segment.endTimestamp) / 2;
    const startTimestamp = Math.max(segment.startTimestamp, midpoint - VOICEPRINT_DURATION / 2);
    const endTimestamp = Math.min(segment.endTimestamp, startTimestamp + VOICEPRINT_DURATION);
    return { startTimestamp, endTimestamp };
}

/** The segments a person's voiceprint may be cut from (voiceprintSourceSegments), longest first. */
export async function findVoiceprintSources(personId: string): Promise<SpeakerSegment[]> {
    const person = await prisma.person.findUnique({
        where: { id: personId },
        include: {
            speakerTags: {
                include: voiceprintCandidateTagInclude,
            },
        },
    });

    if (!person) {
        return [];
    }

    const duration = (segment: SpeakerSegment) => segment.endTimestamp - segment.startTimestamp;
    return voiceprintSourceSegments(person.speakerTags).sort((a, b) => duration(b) - duration(a));
}
