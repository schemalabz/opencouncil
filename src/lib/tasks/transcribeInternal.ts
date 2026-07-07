import { TranscribeRequest, Voiceprint } from "../apiTypes";
import { startTask } from "./tasks";
import { Prisma } from "@prisma/client";
import prisma from "../db/prisma";
import { getPeopleForMeeting } from "@/lib/db/people";
import { getRoleTypePriority } from "../utils";
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
    force = false,
    expectedDurationSeconds,
}: {
    force?: boolean;
    /** Livestream wall-clock length (actualEndTime - actualStartTime), in seconds.
     *  Passed to the backend so it can reject a partial download of a still-processing VOD. */
    expectedDurationSeconds?: number;
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
        throw new Error("Council meeting not found");
    }

    if (councilMeeting.speakerSegments.length > 0) {
        if (force) {
            await deleteExistingSpeakerData(councilMeetingId, cityId);
        } else {
            console.log(`Meeting already has speaker segments`);
            throw new Error('Meeting already has speaker segments');
        }
    }

    const city = councilMeeting.city;

    // Get voiceprints for relevant people based on meeting's administrative body
    const people = await getPeopleForMeeting(cityId, councilMeeting.administrativeBodyId);
    const peopleWithVoiceprints = people
        .filter(person => person.voicePrints && person.voicePrints.length > 0);

    // Pyannote.ai supports max 50 voiceprints per request.
    // When over the limit, people are already sorted by role priority from getPeopleForMeeting
    // (mayors, deputy mayors, council heads, etc.). Use speaking time as tiebreaker within
    // the same role priority tier.
    const MAX_VOICEPRINTS = 50;
    if (peopleWithVoiceprints.length > MAX_VOICEPRINTS) {
        const stats = await getStatisticsFor({ cityId }, ["person"]);
        const speakingByPerson = new Map(
            (stats.people ?? []).map(s => [s.item.id, s.speakingSeconds])
        );
        peopleWithVoiceprints.sort((a, b) => {
            const priorityA = Math.min(...a.roles.map(getRoleTypePriority));
            const priorityB = Math.min(...b.roles.map(getRoleTypePriority));
            if (priorityA !== priorityB) return priorityA - priorityB;
            return (speakingByPerson.get(b.id) ?? 0) - (speakingByPerson.get(a.id) ?? 0);
        });
        console.warn(
            `Found ${peopleWithVoiceprints.length} voiceprints but pyannote.ai supports max ${MAX_VOICEPRINTS}, ` +
            `sending top by role priority + speaking time`
        );
    }

    const voiceprints: Voiceprint[] = peopleWithVoiceprints
        .slice(0, MAX_VOICEPRINTS)
        .map(person => ({
            personId: person.id,
            voiceprint: person.voicePrints![0].embedding
        }));

    console.log(`Sending ${voiceprints.length} voiceprints for meeting (${peopleWithVoiceprints.length} total with voiceprints)`);

    const body: Omit<TranscribeRequest, 'callbackUrl'> = {
        youtubeUrl,
        voiceprints: voiceprints.length > 0 ? voiceprints : undefined,
        cityLanguage: city.language,
        expectedDurationSeconds,
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
