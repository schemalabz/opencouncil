"use server";
import { TranscribeResult } from "../apiTypes";
import { CouncilMeeting, SpeakerSegment } from "@prisma/client";
import { Utterance as ApiUtterance } from "../apiTypes";
import prisma from "../db/prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { buildUnknownSpeakerLabel } from "../utils";
import { requestTranscribeInternal, deleteExistingSpeakerData } from "./transcribeInternal";
import { requestFixTranscript } from "./fixTranscript";
import { sendTaskAdminAlert } from "../discord";

/**
 * Public entry point for transcription. Authorizes the caller, then delegates to
 * requestTranscribeInternal (which the unauthenticated poll-livestreams cron also calls).
 */
export async function requestTranscribe(youtubeUrl: string, councilMeetingId: string, cityId: string, options: {
    force?: boolean;
} = {}) {
    await withUserAuthorizedToEdit({ cityId });

    return requestTranscribeInternal(youtubeUrl, councilMeetingId, cityId, options);
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
                    city: {
                        select: {
                            name_en: true
                        }
                    },
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

    // Auto-chain the next pipeline step: a fresh transcript always needs fixing.
    // force bypasses the already-succeeded idempotency guard on re-transcribes,
    // where the prior fixTranscript applies to utterances that no longer exist.
    // Guarded so a trigger failure never fails the transcribe import itself —
    // an uncaught throw here would mark the transcribe task as failed.
    try {
        await requestFixTranscript(task.councilMeetingId, task.cityId, { force: true });
        console.log(`Auto-triggered fixTranscript for ${task.cityId}/${task.councilMeetingId}`);
    } catch (error) {
        console.error(`Failed to auto-trigger fixTranscript for ${task.cityId}/${task.councilMeetingId}:`, error);
        // Nothing may escape this catch — a throw here would fail the succeeded
        // transcribe import. The alert's taskId is the transcribe task's: the
        // fixTranscript task may not have been created at all.
        await sendTaskAdminAlert({
            status: 'failed',
            taskType: 'fixTranscript',
            cityName: task.councilMeeting.city.name_en,
            meetingName: task.councilMeeting.name_en,
            taskId,
            cityId: task.cityId,
            meetingId: task.councilMeetingId,
            error: `Failed to auto-trigger after successful transcribe (task ID is the transcribe task's): ${error instanceof Error ? error.message : String(error)}`,
        }).catch((alertError) => console.error('Failed to send auto-trigger failure alert:', alertError));
    }
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
