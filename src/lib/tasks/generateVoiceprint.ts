import "server-only";

import prisma from "@/lib/db/prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { startTask } from "./tasks";
import { GenerateVoiceprintRequest } from "../apiTypes";
import { Prisma, SpeakerSegment, TaskStatus } from "@prisma/client";
import { hasVoicePrintConsent, openPeriodWhere, voicePrintConsentInForce } from "@/lib/db/voicePrintConsentRule";
import { meetingNameSelect } from "@/lib/db/types";
import { meetingLabelInCity } from "@/lib/meetingName";
import { interleaveBy } from "@/lib/utils/interleave";
import { voiceprintNeedsOwnConsent } from "@/lib/utils/bodyTier";

const VOICEPRINT_DURATION = 30;

/**
 * What decides whether an admin may start the voiceprint of a person at
 * all: a member of a secondary body alone needs a consent from their own
 * account (#829), the one that claimed their page; a consent that a delegate
 * gave, or one from before the member's roles changed, does not count.
 * Anyone else is under the rules of today.
 */
const voiceprintConsentSelect = {
    roles: { select: { administrativeBody: { select: { type: true } } } },
    voicePrintConsents: { where: { ...openPeriodWhere, source: 'PERSON' as const }, select: { userId: true } },
    administrators: { where: { claimedAt: { not: null } }, select: { userId: true } },
} satisfies Prisma.PersonSelect;

function mayStartVoiceprint(person: Prisma.PersonGetPayload<{ select: typeof voiceprintConsentSelect }>): boolean {
    if (!voiceprintNeedsOwnConsent(person.roles)) return true;
    const own = new Set(person.administrators.map(row => row.userId));
    return person.voicePrintConsents.some(consent => consent.userId !== null && own.has(consent.userId));
}

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

function segmentDuration(segment: Pick<SpeakerSegment, "startTimestamp" | "endTimestamp">): number {
    return segment.endTimestamp - segment.startTimestamp;
}

function isLongEnoughForVoiceprint(segment: Pick<SpeakerSegment, "startTimestamp" | "endTimestamp">): boolean {
    return segmentDuration(segment) >= VOICEPRINT_DURATION;
}

/**
 * Find the people of a city who are eligible for voiceprint generation: all of
 * them, or only those in `personIds`. Eligible means: their voiceprint consent
 * is in force, they have at least one source segment of VOICEPRINT_DURATION
 * or longer, and they don't already have a voiceprint. The query
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
            ...voiceprintConsentSelect,
            speakerTags: {
                include: voiceprintCandidateTagInclude
            }
        }
    });

    // Leave out a person whose own consent is missing (#829).
    const eligiblePeople = peopleWithoutVoiceprints.filter(person =>
        mayStartVoiceprint(person) &&
        voiceprintSourceSegments(person.speakerTags).some(isLongEnoughForVoiceprint)
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
 * Request to generate a voiceprint for a person from one of their samples: the
 * one the admin chose in the dialog (getVoiceprintSamples). A superadmin's action
 * (see findEligiblePeopleForVoiceprintGeneration), authorized before it reads
 * anything. A refusal comes back as a value: production Next hides the message
 * of an error that a Server Action throws.
 */
export async function requestGenerateVoiceprint(personId: string, segmentId: string): Promise<{ ok: true; task: TaskStatus } | { ok: false; message: string }> {
    await withUserAuthorizedToEdit({});

    const person = await prisma.person.findUnique({ where: { id: personId }, select: voiceprintConsentSelect });
    if (!person) {
        return { ok: false, message: "Person not found" };
    }
    if (!await hasVoicePrintConsent(personId)) {
        return { ok: false, message: "This person has no voiceprint consent in force. No voiceprint is generated or used without one." };
    }
    if (!mayStartVoiceprint(person)) {
        return { ok: false, message: "This person has not consented to a voiceprint from their own account; no voiceprint can be made for them." };
    }

    // The same list the dialog shows, so a page that went stale cannot choose
    // audio that the rule no longer allows.
    const sample = (await findVoiceprintSamples(personId)).find(candidate => candidate.segment.id === segmentId);
    if (!sample) {
        return { ok: false, message: "This segment cannot become the person's voiceprint. Reopen the dialog to hear the current samples." };
    }

    return { ok: true, task: await startVoiceprintTask(personId, sample) };
}

/**
 * Start the voiceprint task for a person from their first sample, the longest
 * source that has media. The caller has authorized and checked the consent.
 */
async function startVoiceprintGeneration(personId: string) {
    const [sample] = await findVoiceprintSamples(personId);

    if (!sample) {
        throw new Error(`No segment of at least ${VOICEPRINT_DURATION}s in a meeting with media can become this person's voiceprint`);
    }

    return startVoiceprintTask(personId, sample);
}

/** Start the voiceprint task for a sample. The caller has authorized and checked the consent. */
async function startVoiceprintTask(personId: string, { segment, mediaUrl }: VoiceprintSample) {
    const request: Omit<GenerateVoiceprintRequest, "callbackUrl"> = {
        mediaUrl,
        personId,
        segmentId: segment.id,
        ...voiceprintWindow(segment),
        cityId: segment.cityId,
    };

    return startTask("generateVoiceprint", request, segment.meetingId, segment.cityId);
}

/** The media a voiceprint is cut from, and its sample played from. */
function voiceprintMediaUrl(meeting: { audioUrl: string | null; videoUrl: string | null }): string | null {
    return meeting.audioUrl || meeting.videoUrl;
}

/**
 * The VOICEPRINT_DURATION seconds at the middle of a segment: what the
 * voiceprint is cut from, and what its sample plays.
 */
function voiceprintWindow(segment: Pick<SpeakerSegment, "startTimestamp" | "endTimestamp">) {
    const midpoint = (segment.startTimestamp + segment.endTimestamp) / 2;
    const startTimestamp = Math.max(segment.startTimestamp, midpoint - VOICEPRINT_DURATION / 2);
    const endTimestamp = Math.min(segment.endTimestamp, startTimestamp + VOICEPRINT_DURATION);
    return { startTimestamp, endTimestamp };
}

/**
 * The segments a person's voiceprint may be cut from (voiceprintSourceSegments)
 * that are long enough for one, in sample order (orderVoiceprintSources).
 */
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

    return orderVoiceprintSources(
        voiceprintSourceSegments(person.speakerTags)
            .filter(isLongEnoughForVoiceprint),
    );
}

/** A meeting's key: its id is unique only within its city. */
function meetingKey(row: { cityId: string; meetingId: string }): string {
    return `${row.cityId}/${row.meetingId}`;
}

/**
 * Order a person's voiceprint sources as the admin hears them, one sample at a
 * time: each meeting's longest segment before any meeting's second longest, so
 * that "another one" moves to another recording while there is one. Bad audio
 * is usually a property of the recording. The meetings come in the order of
 * their longest segment, so the first is the longest of all.
 */
export function orderVoiceprintSources(segments: SpeakerSegment[]): SpeakerSegment[] {
    const longestFirst = [...segments].sort((a, b) => segmentDuration(b) - segmentDuration(a));
    return interleaveBy(longestFirst, meetingKey);
}

/** A voiceprint source with the media it would be cut from. */
interface VoiceprintSample {
    segment: SpeakerSegment;
    mediaUrl: string;
    meetingName: string;
}

/**
 * Every source of the person whose meeting has media, in sample order. The one
 * list behind the dialog's samples, the request for a chosen sample and the bulk
 * generation.
 */
async function findVoiceprintSamples(personId: string): Promise<VoiceprintSample[]> {
    const sources = await findVoiceprintSources(personId);
    if (sources.length === 0) {
        return [];
    }

    const meetingIds = new Map(sources.map(source => [meetingKey(source), { cityId: source.cityId, id: source.meetingId }]));
    const meetings = await prisma.councilMeeting.findMany({
        where: { OR: [...meetingIds.values()] },
        select: {
            id: true,
            cityId: true,
            audioUrl: true,
            videoUrl: true,
            ...meetingNameSelect,
            city: { select: { timezone: true } },
        },
    });
    const meetingsByKey = new Map(meetings.map(meeting => [meetingKey({ cityId: meeting.cityId, meetingId: meeting.id }), meeting]));

    return sources.flatMap(segment => {
        const meeting = meetingsByKey.get(meetingKey(segment));
        const mediaUrl = meeting && voiceprintMediaUrl(meeting);
        if (!meeting || !mediaUrl) return [];
        return [{ segment, mediaUrl, meetingName: meetingLabelInCity(meeting, "el") }];
    });
}

const MAX_VOICEPRINT_SAMPLES = 10;

/**
 * The samples a person's voiceprint is chosen from, for the dialog: the window
 * that each would be cut from, and the media to play it from. A superadmin's
 * action, as the requests above. It does not check the consent: a sample makes
 * no voiceprint, and requestGenerateVoiceprint checks the consent before it
 * makes one.
 */
export async function getVoiceprintSamples(personId: string) {
    await withUserAuthorizedToEdit({});

    return (await findVoiceprintSamples(personId))
        .slice(0, MAX_VOICEPRINT_SAMPLES)
        .map(({ segment, mediaUrl, meetingName }) => ({
            segmentId: segment.id,
            meetingName,
            mediaUrl,
            ...voiceprintWindow(segment),
        }));
}
