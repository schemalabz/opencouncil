"use server";
import { TranscribeRequest, TranscribeResult, Voiceprint } from "../apiTypes";
import { startTask } from "./tasks";
import { CouncilMeeting, Prisma, SpeakerSegment } from "@prisma/client";
import { Utterance as ApiUtterance } from "../apiTypes";
import prisma from "../db/prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { getPeopleForCity } from "@/lib/db/people";

async function deleteExistingSpeakerData(meetingId: string, cityId: string) {
    console.log(`Deleting existing speaker data for meeting ${meetingId}`);
    
    // Get all unique speakerTagIds used by this meeting's segments
    const speakerSegments = await prisma.speakerSegment.findMany({
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
        await prisma.speakerTag.deleteMany({
            where: {
                id: { in: speakerTagIds }
            }
        });
        console.log(`Deleted ${speakerTagIds.length} speaker tags and their associated segments`);
    }
}

export async function requestTranscribe(youtubeUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
    await withUserAuthorizedToEdit({ cityId });

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

    const vocabulary = [city.name, ...city.persons.map(p => p.name), ...city.parties.map(p => p.name)].flatMap(s => s.split(' '));
    const prompt = `Αυτή είναι η απομαγνητοφώνηση της συνεδρίας του δήμου της ${city.name} που έγινε στις ${councilMeeting.dateTime}.`;

    // Get voiceprints for people in the city
    const people = await getPeopleForCity(cityId);
    const voiceprints: Voiceprint[] = people
        .filter(person => person.voicePrints && person.voicePrints.length > 0)
        .map(person => ({
            personId: person.id,
            voiceprint: person.voicePrints![0].embedding
        }));

    console.log(`Found ${voiceprints.length} voiceprints for people in the city`);

    const body: Omit<TranscribeRequest, 'callbackUrl'> = {
        youtubeUrl,
        customVocabulary: vocabulary,
        customPrompt: prompt,
        voiceprints: voiceprints.length > 0 ? voiceprints : undefined,
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

export async function handleTranscribeResult(taskId: string, response: TranscribeResult, options?: { force?: boolean }) {
    const videoUrl = response.videoUrl;
    const audioUrl = response.audioUrl;
    const muxPlaybackId = response.muxPlaybackId;

    const task = await prisma.taskStatus.findUnique({
        where: {
            id: taskId
        },
        include: {
            councilMeeting: {
                include: {
                    speakerSegments: {
                        select: {
                            id: true
                        },
                        take: 1
                    }
                }
            }
        }
    });

    if (!task) {
        throw new Error('Task not found');
    }

    // Delete existing data only when force=true. When force=false we keep existing
    // segments (allowing duplicates) to match the "Reprocess Only" flow.
    // Note: We delete SpeakerTags (not SpeakerSegments) because the cascade relationship
    // goes from SpeakerTag -> SpeakerSegment, so deleting SpeakerTags will automatically
    // delete their associated SpeakerSegments via onDelete: Cascade
    const existingSegmentsCount = task.councilMeeting.speakerSegments.length;
    if (options?.force) {
        await deleteExistingSpeakerData(task.councilMeetingId, task.cityId);
    } else if (existingSegmentsCount > 0) {
        console.log(`Preserving ${existingSegmentsCount} existing speaker segments (force=false); duplicates may be created`);
    }

    await updateMeetingVideo(task.councilMeeting, videoUrl, audioUrl, muxPlaybackId);

    // Start a transaction
    await prisma.$transaction(async (prisma) => {
        // Create speaker tags with person identification when available
        const speakerTags = new Map<number, string>();
        let identifiedSpeakersCount = 0;

        // Process speaker identification results
        if (response.transcript.transcription.speakers && response.transcript.transcription.speakers.length > 0) {
            console.log(`Found ${response.transcript.transcription.speakers.length} speakers in the response`);

            // First, validate all person IDs before creating any speaker tags
            for (const speakerInfo of response.transcript.transcription.speakers) {
                if (speakerInfo.match) {
                    // Verify the person exists before attempting to connect
                    const personExists = await prisma.person.findUnique({
                        where: { id: speakerInfo.match }
                    });
                    
                    if (!personExists) {
                        console.warn(`Warning: Person with ID ${speakerInfo.match} not found. Skipping person connection for speaker ${speakerInfo.speaker}`);
                        speakerInfo.match = null; // Remove the invalid match
                    }
                }
            }

            // Create speaker tags for all speakers
            for (const speakerInfo of response.transcript.transcription.speakers) {
                const speakerTag = await prisma.speakerTag.create({
                    data: {
                        label: `SPEAKER_${speakerInfo.speaker}`,
                        // Only connect if we verified the person exists
                        ...(speakerInfo.match ? { person: { connect: { id: speakerInfo.match } } } : {})
                    }
                });

                if (speakerInfo.match) {
                    identifiedSpeakersCount++;
                }

                speakerTags.set(speakerInfo.speaker, speakerTag.id);
            }
        } else {
            throw new Error('No speakers found. Process cannot continue');
        }

        console.log(`Created ${speakerTags.size} speaker tags (${identifiedSpeakersCount} identified with persons)`);

        // Sanity check: Make sure we have a speaker tag for each unique speaker in the utterances
        const uniqueSpeakersInUtterances = new Set(response.transcript.transcription.utterances.map(u => u.speaker));
        let missingSpeakerTagsCount = 0;

        for (const speaker of uniqueSpeakersInUtterances) {
            if (!speakerTags.has(speaker)) {
                console.warn(`Missing speaker tag for speaker ${speaker} found in utterances. Creating it now.`);
                const speakerTag = await prisma.speakerTag.create({
                    data: {
                        label: `SPEAKER_${speaker}`
                    }
                });
                speakerTags.set(speaker, speakerTag.id);
                missingSpeakerTagsCount++;
            }
        }

        if (missingSpeakerTagsCount > 0) {
            console.log(`Created ${missingSpeakerTagsCount} additional speaker tags from sanity check`);
        } else {
            console.log(`Sanity check passed: All speakers in utterances have corresponding speaker tags`);
        }

        // Generate speaker segments
        const speakerSegments = getSpeakerSegmentsFromUtterances(response.transcript.transcription.utterances);

        // Add speaker segments
        for (const segment of speakerSegments) {
            const createdSegment = await prisma.speakerSegment.create({
                data: {
                    startTimestamp: segment.startTimestamp,
                    endTimestamp: segment.endTimestamp,
                    speakerTag: { connect: { id: speakerTags.get(Number(segment.speakerTagId))! } },
                    meeting: { connect: { cityId_id: { cityId: task.councilMeeting.cityId, id: task.councilMeeting.id } } },
                }
            });

            // Add utterances for this segment
            const segmentUtterances = response.transcript.transcription.utterances.filter(
                u => u.start >= segment.startTimestamp && u.end <= segment.endTimestamp
            );

            // Use createMany for better performance instead of individual creates
            await prisma.utterance.createMany({
                data: segmentUtterances.map(utterance => ({
                    startTimestamp: utterance.start,
                    endTimestamp: utterance.end,
                    text: utterance.text,
                    drift: utterance.drift,
                    speakerSegmentId: createdSegment.id,
                }))
            });

            /* no longer add words
            // Add words for this utterance
            await prisma.word.createMany({
                data: utterance.words.map(word => ({
                    text: word.word,
                    startTimestamp: word.start,
                    endTimestamp: word.end,
                    utteranceId: createdUtterance.id,
                    confidence: word.confidence,
                }))
            });
            */
        }

        console.log(`Created ${speakerSegments.length} speaker segments`);
    }, {
        timeout: 10 * 60 * 1000 // Increased timeout due to more complex operations
    });
}

let getSpeakerSegmentsFromUtterances = (utterances: ApiUtterance[]): SpeakerSegment[] => {
    const speakerSegments: SpeakerSegment[] = [];

    let currentSpeaker: number | null = null;
    let currentSegment: Partial<SpeakerSegment> | null = null;

    for (let i = 0; i < utterances.length; i++) {
        const utterance = utterances[i];

        if (currentSpeaker !== utterance.speaker ||
            (currentSegment && utterance.start - currentSegment.endTimestamp! > 5)) {
            // Start a new segment
            if (currentSegment) {
                speakerSegments.push(currentSegment as SpeakerSegment);
            }
            currentSegment = {
                startTimestamp: utterance.start,
                endTimestamp: utterance.end,
                speakerTagId: utterance.speaker.toString()
            };
            currentSpeaker = utterance.speaker;
        } else {
            // Continue the current segment
            currentSegment!.endTimestamp = utterance.end;
        }

        // If it's the last utterance, add the current segment
        if (i === utterances.length - 1 && currentSegment) {
            speakerSegments.push(currentSegment as SpeakerSegment);
        }
    }

    return speakerSegments;
}

let updateMeetingVideo = async (meeting: CouncilMeeting, videoUrl: string, audioUrl: string, muxPlaybackId: string) => {
    const updatedMeeting = await prisma.councilMeeting.update({
        where: {
            cityId_id: {
                cityId: meeting.cityId,
                id: meeting.id
            }
        },
        data: {
            videoUrl,
            audioUrl,
            muxPlaybackId
        }
    });

    if (!updatedMeeting) {
        throw new Error('Meeting not found');
    }
}