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

export async function requestSummarize(cityId: string, councilMeetingId: string, requestedSubjects: string[] = [], additionalInstructions?: string) {
    const body = await getSummarizeRequestBody(councilMeetingId, cityId, requestedSubjects, additionalInstructions);

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
    const topics = await prisma.topic.findMany();
    const topicsByName = Object.fromEntries(topics.map(t => [t.name, t]));

    await prisma.$transaction(async (prisma) => {
        // Delete old highlights and subjects for this meeting
        await prisma.highlight.deleteMany({
            where: {
                meetingId: councilMeeting.id,
                cityId: councilMeeting.cityId
            }
        });
        await prisma.subject.deleteMany({
            where: {
                councilMeetingId: councilMeeting.id,
                cityId: councilMeeting.cityId
            }
        });
        // Create new subjects and highlights
        for (const subject of response.subjects) {
            // Create location if provided
            let locationId: string | undefined;
            if (subject.location) {
                // Create location using raw SQL since PostGIS geometry is unsupported in Prisma
                const result = await prisma.$queryRaw<[{ id: string }]>`
                    INSERT INTO "Location" (id, type, text, coordinates)
                    VALUES (
                        gen_random_cuid()::text,
                        ${subject.location.type}::text,
                        ${subject.location.text}::text,
                        ST_GeomFromGeoJSON(${JSON.stringify({
                    type: subject.location.type === 'point' ? 'Point' :
                        subject.location.type === 'lineString' ? 'LineString' : 'Polygon',
                    coordinates: subject.location.coordinates
                })})
                    )
                    RETURNING id
                `;
                locationId = result[0].id;
            }

            const createdSubject = await prisma.subject.create({
                data: {
                    name: subject.name,
                    description: subject.description,
                    councilMeeting: { connect: { cityId_id: { cityId: councilMeeting.cityId, id: councilMeeting.id } } },
                    location: locationId ? { connect: { id: locationId } } : undefined,
                    topic: subject.topicLabel && topicsByName[subject.topicLabel] ?
                        { connect: { id: topicsByName[subject.topicLabel].id } } :
                        undefined,
                    hot: subject.hot,
                    agendaItemIndex: subject.agendaItemIndex,
                    speakerSegments: {
                        create: subject.speakerSegments.map(segment => ({
                            speakerSegment: { connect: { id: segment.speakerSegmentId } },
                            summary: segment.summary
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
