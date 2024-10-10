"use server";
import { CouncilMeeting, Prisma, SpeakerSegment } from "@prisma/client";
import { Utterance as ApiUtterance, SummarizeRequest, SummarizeResult } from "../apiTypes";
import { getTranscript } from "../db/transcript";
import { getPeopleForCity } from "../db/people";
import { getPartiesForCity } from "../db/parties";
import { getAllTopics } from "../db/topics";
import { startTask } from "./tasks";
import { getCity } from "../db/cities";
import { getCouncilMeeting } from "../db/meetings";
import prisma from "../db/prisma";
import { getSummarizeRequestBody } from "../db/utils";

export async function requestSummarize(cityId: string, councilMeetingId: string, requestedSubjects: string[] = []) {
    const body = await getSummarizeRequestBody(councilMeetingId, cityId, requestedSubjects);

    return startTask('summarize', body, councilMeetingId, cityId);
}

export async function handleSummarizeResult(taskId: string, response: SummarizeResult) {
    const task = await prisma.taskStatus.findUnique({
        where: {
            id: taskId
        },
        include: {
            councilMeeting: true
        }
    });

    if (!task) {
        throw new Error('Task not found');
    }

    const { councilMeeting } = task;

    const speakerSegments = await prisma.speakerSegment.findMany({
        where: {
            meetingId: councilMeeting.id,
            cityId: councilMeeting.cityId
        }
    });

    const availableSpeakerSegmentIds = speakerSegments.map(s => s.id);

    // Speaker segment transaction
    await prisma.$transaction(async (prisma) => {
        for (const segmentSummary of response.speakerSegmentSummaries) {
            if (!availableSpeakerSegmentIds.includes(segmentSummary.speakerSegmentId)) {
                console.log(`Speaker segment ${segmentSummary.speakerSegmentId} not found`);
                continue;
            }
            // Update or create summary
            await prisma.summary.upsert({
                where: {
                    speakerSegmentId: segmentSummary.speakerSegmentId
                },
                update: {
                    text: segmentSummary.summary || ''
                },
                create: {
                    text: segmentSummary.summary || '',
                    speakerSegment: { connect: { id: segmentSummary.speakerSegmentId } }
                }
            });

            // Update topic labels
            if (segmentSummary.topicLabels) {
                for (const topicLabel of segmentSummary.topicLabels) {
                    const topic = await prisma.topic.findFirst({
                        where: { name: topicLabel }
                    });
                    if (topic) {
                        await prisma.topicLabel.upsert({
                            where: {
                                id: `${segmentSummary.speakerSegmentId}_${topic.id}`
                            },
                            update: {},
                            create: {
                                id: `${segmentSummary.speakerSegmentId}_${topic.id}`,
                                speakerSegment: { connect: { id: segmentSummary.speakerSegmentId } },
                                topic: { connect: { id: topic.id } }
                            }
                        });
                    } else {
                        console.log(`Topic not found: ${topicLabel}`);
                    }
                }
            }
        }
    });

    // Combined Subject and Highlight transaction
    await prisma.$transaction(async (prisma) => {
        for (const subject of response.subjects) {
            const createdSubject = await prisma.subject.create({
                data: {
                    name: subject.name,
                    description: subject.description,
                    councilMeeting: { connect: { cityId_id: { cityId: councilMeeting.cityId, id: councilMeeting.id } } },
                    speakerSegments: {
                        create: subject.speakerSegmentIds.map(ssId => ({
                            speakerSegment: { connect: { id: ssId } }
                        }))
                    }
                }
            });

            const highlight = await prisma.highlight.create({
                data: {
                    name: subject.name,
                    meeting: { connect: { cityId_id: { cityId: councilMeeting.cityId, id: councilMeeting.id } } },
                    subject: { connect: { id: createdSubject.id } }
                }
            });

            await prisma.highlightedUtterance.createMany({
                data: subject.highlightedUtteranceIds.filter(id => id).map(utteranceId => ({
                    utteranceId: utteranceId,
                    highlightId: highlight.id
                }))
            });
        }
    });

    console.log(`Saved summaries and topic labels for meeting ${councilMeeting.id}`);

}
