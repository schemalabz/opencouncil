import "server-only";

import prisma from "@/lib/db/prisma";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import type { VoiceprintCandidateSegment } from "@/lib/db/types";
import { VOICEPRINT_DURATION, computeVoiceprintWindow } from "@/lib/tasks/voiceprintWindow";

export async function getSpeakerSegmentForVoiceprint(personId: string, segmentId: string) {
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

    // Ensure the chosen segment actually belongs to this person. The speakerTag
    // FK is required by the schema, but guard against a missing relation anyway so
    // an unexpected null raises the ownership error rather than a bare TypeError.
    if (!segment.speakerTag || segment.speakerTag.personId !== personId) {
        throw new Error("The selected segment does not belong to this person");
    }

    // dispatchVoiceprintTaskForSegment expects a plain SpeakerSegment; drop the
    // included relation before passing it through.
    const { speakerTag, ...plainSegment } = segment;
    void speakerTag;

    return plainSegment;
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
export async function getVoiceprintCandidatesForPerson(personId: string): Promise<VoiceprintCandidateSegment[]> {
    const person = await prisma.person.findUnique({
        where: { id: personId },
        select: { cityId: true, city: { select: { timezone: true } } },
    });

    if (!person) {
        throw new Error("Person not found");
    }

    await withUserAuthorizedToEdit({ cityId: person.cityId });

    // First pass: scan the person's segments WITHOUT transcripts — just timestamps
    // and meeting metadata — and keep only the longest eligible ones. Prisma can't
    // order/filter by the computed (endTimestamp - startTimestamp) duration, but
    // these rows are cheap, and this bounds the expensive transcript fetch below to
    // MAX_VOICEPRINT_CANDIDATES segments even for prolific speakers.
    const segments = await prisma.speakerSegment.findMany({
        where: {
            speakerTag: { personId },
            // Scope to the person's city: the auth check above only asserts access
            // to person.cityId, so without this a caller could read transcript text
            // (meeting name, timestamps, full text) from segments in other cities.
            cityId: person.cityId,
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
        },
    });

    const topSegments = segments
        .map(segment => ({ ...segment, duration: segment.endTimestamp - segment.startTimestamp }))
        .filter(segment => segment.duration >= VOICEPRINT_DURATION)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, MAX_VOICEPRINT_CANDIDATES);

    if (topSegments.length === 0) {
        return [];
    }

    // Second pass: fetch transcripts only for the chosen segments.
    const utterances = await prisma.utterance.findMany({
        where: { speakerSegmentId: { in: topSegments.map(s => s.id) } },
        orderBy: { startTimestamp: "asc" },
        select: { speakerSegmentId: true, text: true, startTimestamp: true, endTimestamp: true },
    });

    const utterancesBySegment = new Map<string, typeof utterances>();
    for (const utterance of utterances) {
        const list = utterancesBySegment.get(utterance.speakerSegmentId);
        if (list) {
            list.push(utterance);
        } else {
            utterancesBySegment.set(utterance.speakerSegmentId, [utterance]);
        }
    }

    return topSegments.map(segment => {
        // Same media URL the dispatch uses, so the admin previews exactly what
        // the voiceprint job will consume.
        const mediaUrl = segment.meeting.audioUrl || segment.meeting.videoUrl || null;
        const previewWindow = computeVoiceprintWindow(segment.startTimestamp, segment.endTimestamp);

        const segmentUtterances = utterancesBySegment.get(segment.id) ?? [];

        // windowText is the transcript of the centered 30s window the voiceprint
        // uses — i.e. what the admin hears in the audio preview, so they can read
        // along. fullText is the whole segment, shown on demand.
        const windowText = segmentUtterances
            .filter(
                u =>
                    u.startTimestamp < previewWindow.endTimestamp &&
                    u.endTimestamp > previewWindow.startTimestamp,
            )
            .map(u => u.text)
            .join(" ")
            .trim();
        const fullText = segmentUtterances.map(u => u.text).join(" ").trim();

        return {
            segmentId: segment.id,
            meetingId: segment.meetingId,
            cityId: segment.cityId,
            meetingName: segment.meeting.name,
            meetingNameEn: segment.meeting.name_en,
            meetingDate: segment.meeting.dateTime.toISOString(),
            meetingTimezone: person.city.timezone,
            startTimestamp: segment.startTimestamp,
            endTimestamp: segment.endTimestamp,
            duration: segment.duration,
            mediaUrl,
            previewStartTimestamp: previewWindow.startTimestamp,
            previewEndTimestamp: previewWindow.endTimestamp,
            windowText,
            fullText,
        };
    });
}

