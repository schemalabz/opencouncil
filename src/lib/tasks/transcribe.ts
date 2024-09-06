"use server";
import { TranscribeRequest, TranscribeResult } from "../apiTypes";
import { startTask } from "./tasks";
import { CouncilMeeting, Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
            utterances: {
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

    if (councilMeeting.utterances.length > 0) {
        if (force) {
            console.log(`Deleting utterances for meeting ${councilMeetingId}`);
            await prisma.utterance.deleteMany({
                where: {
                    meetingId: councilMeetingId,
                    cityId
                }
            });
        } else {
            throw new Error('Meeting already has utterances');
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

    return startTask('transcribe', body, councilMeetingId, cityId);
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
                    utterances: {
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
        // Add utterances
        const utterances = await prisma.utterance.createMany({
            data: response.transcript.transcription.utterances.map(utterance => ({
                startTimestamp: utterance.start,
                endTimestamp: utterance.end,
                text: utterance.text,
                speakerTagId: speakerTags.get(utterance.speaker)!,
                meetingId: task.councilMeeting.id,
                cityId: task.councilMeeting.cityId,
            }))
        });

        // Add words separately
        for (const utterance of response.transcript.transcription.utterances) {
            const createdUtterance = await prisma.utterance.findFirst({
                where: {
                    startTimestamp: utterance.start,
                    endTimestamp: utterance.end,
                    text: utterance.text,
                    meetingId: task.councilMeeting.id,
                    cityId: task.councilMeeting.cityId,
                },
            });

            if (createdUtterance) {
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

        console.log(`Created a transcript of ${utterances.count} utterances`);
    }, {
        timeout: 30000
    });
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