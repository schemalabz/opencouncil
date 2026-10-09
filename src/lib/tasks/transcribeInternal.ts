import { TranscribeRequest, Voiceprint } from "../apiTypes";
import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { startTask } from "./tasks";
import { Prisma } from "@prisma/client";
import { transcriptionRefusal } from "@/lib/meetingLifecycleRules";
import prisma from "../db/prisma";
import { getPeopleWhoMaySpeak } from "@/lib/db/people";
import { getRoleTypePriority } from "../utils";
import { voiceprintPriorityGroup } from "./voiceprintPriority";
import { getStatisticsFor } from "../statistics";

/**
 * Core transcribe logic without auth checks.
 *
 * NOT in a "use server" file — this must not be callable as a Server Action.
 * Only called from:
 *   - requestTranscribe (after withUserAuthorizedToEdit), in ./transcribe
 *   - the poll-livestreams cron (unauthenticated background job)
 */

export async function deleteExistingSpeakerData(
    meetingId: string,
    cityId: string,
    db: Prisma.TransactionClient | typeof prisma = prisma
) {
    console.log(`Deleting existing speaker data for meeting ${meetingId}`);

    // Get all unique speakerTagIds used by this meeting's segments
    const speakerSegments = await db.speakerSegment.findMany({
        where: {
            meetingId,
            cityId
        },
        select: {
            speakerTagId: true
        }
    });

    const speakerTagIds = [...new Set(speakerSegments.map(s => s.speakerTagId))];

    // Delete the SpeakerTags, which will cascade delete the SpeakerSegments
    if (speakerTagIds.length > 0) {
        await db.speakerTag.deleteMany({
            where: {
                id: { in: speakerTagIds }
            }
        });
        console.log(`Deleted ${speakerTagIds.length} speaker tags and their associated segments`);
    }
}

export async function requestTranscribeInternal(youtubeUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
    console.log(`Requesting transcription for ${youtubeUrl}`);
    const councilMeeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                id: councilMeetingId,
                cityId
            }
        },
        include: {
            city: {
                include: {
                    persons: true,
                    parties: true
                }
            },
            speakerSegments: {
                select: {
                    id: true
                },
                take: 1
            }
        }
    });

    if (!councilMeeting) {
        throw new NotFoundError("Council meeting not found");
    }

    // The admin button and the livestream cron both reach this function, so
    // the refusal does not depend on the UI.
    const refusal = transcriptionRefusal(councilMeeting);
    if (refusal) {
        throw new ConflictError(refusal);
    }

    // A typed refusal, so every caller — the admin page, the cron, a tool —
    // can show it as it is instead of as an internal error. With force the
    // old transcript stays until the new one lands: handleTranscribeResult
    // deletes it inside the import transaction, so a job the task server
    // refuses leaves the meeting as it was.
    if (councilMeeting.speakerSegments.length > 0 && !force) {
        console.log(`Meeting already has speaker segments`);
        throw new ConflictError('The meeting already has a transcript. A re-run must set force, which replaces it, with its highlights.');
    }

    const city = councilMeeting.city;

    // Voiceprints of the people who may speak at this meeting
    const people = await getPeopleWhoMaySpeak(cityId, councilMeeting.administrativeBodyId, councilMeeting.dateTime);
    const voicePrintRows = await prisma.voicePrint.findMany({
        where: { personId: { in: people.map(person => person.id) } },
        orderBy: { createdAt: 'desc' },
        select: { personId: true, embedding: true },
    });
    const embeddingByPerson = new Map<string, string>();
    for (const row of voicePrintRows) {
        if (!embeddingByPerson.has(row.personId)) {
            embeddingByPerson.set(row.personId, row.embedding);
        }
    }
    const peopleWithVoiceprints = people
        .filter(person => embeddingByPerson.has(person.id));

    // Pyannote.ai supports max 50 voiceprints per request.
    // When over the limit: the mayor and the other city-level roles first, then the
    // current members of the body that is meeting, then everyone else (see
    // voiceprintPriorityGroup). Within each group by role priority (council heads,
    // party leaders, etc.), with speaking time as tiebreaker.
    const MAX_VOICEPRINTS = 50;
    if (peopleWithVoiceprints.length > MAX_VOICEPRINTS) {
        const stats = await getStatisticsFor({ cityId }, ["person"]);
        const speakingByPerson = new Map(
            (stats.people ?? []).map(s => [s.item.id, s.speakingSeconds])
        );
        const group = (person: typeof people[number]) =>
            voiceprintPriorityGroup(person, councilMeeting.administrativeBodyId, councilMeeting.dateTime);
        peopleWithVoiceprints.sort((a, b) => {
            if (group(a) !== group(b)) return group(a) - group(b);
            const priorityA = Math.min(...a.roles.map(getRoleTypePriority));
            const priorityB = Math.min(...b.roles.map(getRoleTypePriority));
            if (priorityA !== priorityB) return priorityA - priorityB;
            return (speakingByPerson.get(b.id) ?? 0) - (speakingByPerson.get(a.id) ?? 0);
        });
        console.warn(
            `Found ${peopleWithVoiceprints.length} voiceprints but pyannote.ai supports max ${MAX_VOICEPRINTS}, ` +
            `sending city-level roles and the meeting body's members first, then by role priority + speaking time`
        );
    }

    const voiceprints: Voiceprint[] = peopleWithVoiceprints
        .slice(0, MAX_VOICEPRINTS)
        .map(person => ({
            personId: person.id,
            voiceprint: embeddingByPerson.get(person.id)!
        }));

    console.log(`Sending ${voiceprints.length} voiceprints for meeting (${peopleWithVoiceprints.length} total with voiceprints)`);

    // `force` rides in the stored request so the callback can hand it to the
    // result handler; the task server ignores it.
    const body: Omit<TranscribeRequest, 'callbackUrl'> & { force?: boolean } = {
        youtubeUrl,
        voiceprints: voiceprints.length > 0 ? voiceprints : undefined,
        cityLanguage: city.language,
        ...(force && { force }),
    }

    await prisma.councilMeeting.update({
        where: {
            cityId_id: {
                id: councilMeetingId,
                cityId
            }
        },
        data: {
            youtubeUrl
        }
    });

    console.log(`Transcribe body: ${JSON.stringify(body)}`);
    return startTask('transcribe', body, councilMeetingId, cityId, { force });
}

