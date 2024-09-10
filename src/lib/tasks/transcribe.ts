"use server";
import { TranscribeRequest, TranscribeResult } from "../apiTypes";
import { startTask } from "./tasks";
import { CouncilMeeting, Prisma, SpeakerSegment } from "@prisma/client";
import { Utterance as ApiUtterance } from "../apiTypes";
import prisma from "../db/prisma";

export async function requestTranscribe(youtubeUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
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

    if (councilMeeting.speakerSegments.length > 0 && !force) {
        if (force) {
            console.log(`Deleting speaker segments for meeting ${councilMeetingId}`);
            await prisma.speakerSegment.deleteMany({
                where: {
                    meetingId: councilMeetingId,
                    cityId
                }
            });
        } else {
            throw new Error('Meeting already has speaker segments');
        }
    }

    const city = councilMeeting.city;

    const vocabulary = [city.name, ...city.persons.map(p => p.name), ...city.parties.map(p => p.name)];
    const prompt = `Αυτή είναι η απομαγνητοφώνηση της συνεδρίας του δήμου της ${city.name} που έγινε στις ${councilMeeting.dateTime}.`;

    const body: Omit<TranscribeRequest, 'callbackUrl'> = {
        youtubeUrl,
        customVocabulary: vocabulary,
        customPrompt: prompt,
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

    return startTask('transcribe', body, councilMeetingId, cityId, { force });
}

export async function handleTranscribeResult(taskId: string, response: TranscribeResult) {
    const videoUrl = response.videoUrl;
    const audioUrl = response.audioUrl;

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

    await updateMeetingVideo(task.councilMeeting, videoUrl, audioUrl);
    // Start a transaction
    await prisma.$transaction(async (prisma) => {
        // Create speaker tags
        const speakerTags = new Map<number, string>();
        for (const utterance of response.transcript.transcription.utterances) {
            if (!speakerTags.has(utterance.speaker)) {
                const speakerTag = await prisma.speakerTag.create({
                    data: {
                        label: `SPEAKER_${utterance.speaker}`,
                    }
                });
                speakerTags.set(utterance.speaker, speakerTag.id);
            }
        }
        console.log(`Created ${speakerTags.size} speaker tags`);

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

            for (const utterance of segmentUtterances) {
                const createdUtterance = await prisma.utterance.create({
                    data: {
                        startTimestamp: utterance.start,
                        endTimestamp: utterance.end,
                        text: utterance.text,
                        drift: utterance.drift,
                        speakerSegment: { connect: { id: createdSegment.id } },
                    }
                });

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
            }
        }

        console.log(`Created ${speakerSegments.length} speaker segments`);
    }, {
        timeout: 120000 // Increased timeout due to more complex operations
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

let updateMeetingVideo = async (meeting: CouncilMeeting, videoUrl: string, audioUrl: string) => {
    const updatedMeeting = await prisma.councilMeeting.update({
        where: {
            cityId_id: {
                cityId: meeting.cityId,
                id: meeting.id
            }
        },
        data: {
            videoUrl,
            audioUrl
        }
    });

    if (!updatedMeeting) {
        throw new Error('Meeting not found');
    }
}