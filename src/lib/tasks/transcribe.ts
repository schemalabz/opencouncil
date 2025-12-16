"use server";
import { TranscribeRequest, TranscribeResult, Voiceprint } from "../apiTypes";
import { startTask } from "./tasks";
import { CouncilMeeting, Prisma, SpeakerSegment } from "@prisma/client";
import { Utterance as ApiUtterance } from "../apiTypes";
import prisma from "../db/prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { getPeopleForCity } from "@/lib/db/people";
import { buildUnknownSpeakerLabel } from "../utils";

async function deleteExistingSpeakerData(
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

    const existingSegmentsCount = task.councilMeeting.speakerSegments.length;

    await updateMeetingVideo(task.councilMeeting, videoUrl, audioUrl, muxPlaybackId);

    // Pre-compute speaker segments and utterance mappings before transaction
    // This reduces time spent inside the transaction
    console.log(`Pre-computing speaker segments and utterance mappings...`);
    const preComputeStart = Date.now();
    
    const speakerSegmentsData = getSpeakerSegmentsFromUtterances(response.transcript.transcription.utterances);
    
    // Pre-map utterances to segments to avoid filtering inside transaction
    const segmentUtteranceMap = new Map<number, typeof response.transcript.transcription.utterances>();
    speakerSegmentsData.forEach((segment, index) => {
        const segmentUtterances = response.transcript.transcription.utterances.filter(
            u => u.start >= segment.startTimestamp && u.end <= segment.endTimestamp
        );
        segmentUtteranceMap.set(index, segmentUtterances);
    });
    
    console.log(`Pre-computed ${speakerSegmentsData.length} segments with utterances in ${((Date.now() - preComputeStart) / 1000).toFixed(2)}s`);

    // Start a transaction
    console.log(`Starting transaction to create speaker segments and utterances`);
    const transactionStartTime = Date.now();

    await prisma.$transaction(async (tx) => {
        // Delete existing data only when force=true. When force=false we keep existing
        // segments (allowing duplicates) to match the "Reprocess Only" flow.
        // Note: We delete SpeakerTags (not SpeakerSegments) because the cascade relationship
        // goes from SpeakerTag -> SpeakerSegment, so deleting SpeakerTags will automatically
        // delete their associated SpeakerSegments via onDelete: Cascade
        if (options?.force) {
            await deleteExistingSpeakerData(task.councilMeetingId, task.cityId, tx);
        } else if (existingSegmentsCount > 0) {
            console.log(`Preserving ${existingSegmentsCount} existing speaker segments (force=false); duplicates may be created`);
        }

        // Create speaker tags with person identification when available
        const speakerTags = new Map<number, string>();
        let identifiedSpeakersCount = 0;
        let unknownCounter = 1;
        const nextUnknownLabel = () => buildUnknownSpeakerLabel(unknownCounter++);

        // Process speaker identification results
        if (response.transcript.transcription.speakers && response.transcript.transcription.speakers.length > 0) {
            console.log(`Found ${response.transcript.transcription.speakers.length} speakers in the response`);

            // First, validate all person IDs before creating any speaker tags
            for (const speakerInfo of response.transcript.transcription.speakers) {
                if (speakerInfo.match) {
                    // Verify the person exists before attempting to connect
                    const personExists = await tx.person.findUnique({
                        where: { id: speakerInfo.match }
                    });
                    
                    if (!personExists) {
                        console.warn(`Warning: Person with ID ${speakerInfo.match} not found. Skipping person connection for speaker ${speakerInfo.speaker}`);
                        speakerInfo.match = null; // Remove the invalid match
                    }
                }
            }

            // Create speaker tags for all speakers
            console.log(`Creating ${response.transcript.transcription.speakers.length} speaker tags...`);

            // 1. Map speaker ID to match info for quick lookup
            const speakerMatchMap = new Map(
                response.transcript.transcription.speakers.map(s => [s.speaker, s])
            );

            // 2. Get unique speakers in order of appearance from utterances
            // JavaScript Set preserves insertion order, and utterances are time-sorted
            const speakersInOrder = [...new Set(response.transcript.transcription.utterances.map(u => u.speaker))];

            // 3. Create tags in appearance order
            for (const speakerId of speakersInOrder) {
                // Skip if we already processed this speaker (just in case)
                if (speakerTags.has(speakerId)) continue;

                const matchInfo = speakerMatchMap.get(speakerId);
                const isMatched = matchInfo?.match;

                const speakerTag = await tx.speakerTag.create({
                    data: {
                        label: isMatched
                            ? `SPEAKER_${speakerId}`
                            : nextUnknownLabel(),
                        // Only connect if we verified the person exists
                        ...(isMatched ? { person: { connect: { id: matchInfo.match! } } } : {})
                    }
                });

                if (isMatched) {
                    identifiedSpeakersCount++;
                }

                speakerTags.set(speakerId, speakerTag.id);
            }

            // Check if there are speakers in the identified speakers list that were not in the utterances
            // This is just for logging/debugging, as we only create tags for speakers who actually speak
            const unusedSpeakers = [...speakerMatchMap.keys()].filter(id => !speakerTags.has(id));
            
            if (unusedSpeakers.length > 0) {
                console.log(`Note: ${unusedSpeakers.length} speakers listed in identified speakers but not found in utterances: ${unusedSpeakers.join(', ')}`);
            }
        } else {
            throw new Error('No speakers found. Process cannot continue');
        }

        console.log(`Created ${speakerTags.size} speaker tags (${identifiedSpeakersCount} identified with persons)`);

        // OPTIMIZATION: Create segments in parallel batches with nested utterances
        // This dramatically reduces database round-trips from 2N sequential to N/BATCH_SIZE parallel batches
        // Performance: ~10-50x faster than sequential processing
        console.log(`Creating ${speakerSegmentsData.length} segments with nested utterances in parallel batches...`);
        const segmentCreationStart = Date.now();
        
        const BATCH_SIZE = 50; // Process 50 segments at a time in parallel
        let processedSegments = 0;
        
        for (let i = 0; i < speakerSegmentsData.length; i += BATCH_SIZE) {
            const batch = speakerSegmentsData.slice(i, i + BATCH_SIZE);
            
            // Create all segments in this batch in parallel with their utterances
            await Promise.all(batch.map(async (segment, batchIndex) => {
                const segmentIndex = i + batchIndex;
                const segmentUtterances = segmentUtteranceMap.get(segmentIndex)!;

                // Create segment with nested utterances in a single DB operation
                return tx.speakerSegment.create({
                    data: {
                        startTimestamp: segment.startTimestamp,
                        endTimestamp: segment.endTimestamp,
                        speakerTag: { connect: { id: speakerTags.get(Number(segment.speakerTagId))! } },
                        meeting: { connect: { cityId_id: { cityId: task.councilMeeting.cityId, id: task.councilMeeting.id } } },
                        utterances: {
                            createMany: {
                                data: segmentUtterances.map(utterance => ({
                                    startTimestamp: utterance.start,
                                    endTimestamp: utterance.end,
                                    text: utterance.text,
                                    drift: utterance.drift,
                                }))
                            }
                        }
                    }
                });
            }));
            
            processedSegments += batch.length;
            const elapsed = ((Date.now() - segmentCreationStart) / 1000).toFixed(1);
            console.log(`Batch progress: ${processedSegments}/${speakerSegmentsData.length} segments created - ${elapsed}s elapsed`);
        }

        const transactionDuration = ((Date.now() - transactionStartTime) / 1000).toFixed(2);
        console.log(`Successfully created ${speakerSegmentsData.length} speaker segments with all utterances in ${transactionDuration}s`);
    }, {
        timeout: 10 * 60 * 1000, // Increased timeout due to more complex operations
        maxWait: 5000, // Maximum time to wait for a connection from the pool (5 seconds)
    });
    
    console.log(`Transaction completed successfully`);
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
