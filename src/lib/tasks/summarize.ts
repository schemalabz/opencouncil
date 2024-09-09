"use server";
import { CouncilMeeting, Prisma, PrismaClient, SpeakerSegment } from "@prisma/client";
import { Utterance as ApiUtterance, SummarizeRequest, SummarizeResult } from "../apiTypes";
import { getTranscript } from "../db/transcript";
import { getPeopleForCity } from "../db/people";
import { getPartiesForCity } from "../db/parties";
import { getAllTopics } from "../db/topics";
import { startTask } from "./tasks";
import { getCity } from "../db/cities";
import { getCouncilMeeting } from "../db/meetings";
const prisma = new PrismaClient();

export async function requestSummarize(cityId: string, councilMeetingId: string, {
}: {
    } = {}) {
    const transcript = await getTranscript(councilMeetingId, cityId);
    const people = await getPeopleForCity(cityId);
    const parties = await getPartiesForCity(cityId);
    const topics = await getAllTopics();
    const city = await getCity(cityId);
    const councilMeeting = await getCouncilMeeting(cityId, councilMeetingId);

    if (!city || !councilMeeting) {
        throw new Error('City or council meeting not found');
    }

    const body: Omit<SummarizeRequest, 'callbackUrl'> = {
        transcript: transcript.map(t => {
            const person = people.find(p => p.id === t.speakerTag.personId);
            let speakerName = t.speakerTag.label;
            let speakerParty: string | null = null;
            if (person) {
                speakerName = person.name;
                if (person.partyId) {
                    speakerParty = parties.find(p => p.id === person.partyId)?.name || null;
                }
            }

            return {
                speakerName: speakerName,
                speakerParty: speakerParty,
                speakerSegmentId: t.id,
                text: t.utterances.map(u => u.text).join(' '),
            };
        }),
        topicLabels: topics.map(t => t.name),
        cityName: city.name,
        date: councilMeeting.dateTime.toISOString().split('T')[0],
    }

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

    const availableSpeakerSegments = await prisma.speakerSegment.findMany({
        where: {
            meetingId: councilMeeting.id,
            cityId: councilMeeting.cityId
        }
    });

    const availableSpeakerSegmentIds = availableSpeakerSegments.map(s => s.id);

    // Start a transaction
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

    console.log(`Saved summaries and topic labels for meeting ${councilMeeting.id}`);

}
