import { City } from "@prisma/client";
import { getCity } from "../db/cities";
import { getCouncilMeeting } from "../db/meetings";
import { startTask } from "./tasks";
import { getTranscript } from "../db/transcript";
import { getPeopleForCity } from "../db/people";
import { getPartiesForCity } from "../db/parties";
import { getAllTopics } from "../db/topics";
import { ExtractHighlightsRequest } from "../apiTypes";

export async function requestExtractHighlights(cityId: City["id"], councilMeetingId: City["id"], names: string[]) {
    const transcript = await getTranscript(councilMeetingId, cityId);
    const people = await getPeopleForCity(cityId);
    const parties = await getPartiesForCity(cityId);
    const topics = await getAllTopics();
    const city = await getCity(cityId);
    const councilMeeting = await getCouncilMeeting(cityId, councilMeetingId);

    if (!city || !councilMeeting) {
        throw new Error('City or council meeting not found');
    }

    const body: Omit<ExtractHighlightsRequest, 'callbackUrl'> = {
        names: names,
        transcript: {
            speakerName: transcript[0].speakerTag.label,
            speakerParty: null,
            speakerSegmentId: transcript[0].id,
            utterances: transcript[0].utterances.map(u => ({
                text: u.text,
                utteranceId: u.id
            }))
        },
        topicLabels: topics.map(t => t.name),
        cityName: city.name,
        date: councilMeeting.dateTime.toISOString().split('T')[0],
    }

    return startTask('extractHighlights', body, councilMeetingId, cityId);
}

import prisma from "../db/prisma";
import { ExtractHighlightsResult } from "../apiTypes";

export async function handleExtractHighlightsResult(taskId: string, response: ExtractHighlightsResult) {
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

    // Start a transaction
    await prisma.$transaction(async (prisma) => {
        for (const highlight of response.highlights) {
            // Create a new Highlight
            const newHighlight = await prisma.highlight.create({
                data: {
                    name: highlight.name,
                    meeting: { connect: { cityId_id: { cityId: councilMeeting.cityId, id: councilMeeting.id } } }
                }
            });

            // Create HighlightedUtterances for each utteranceId
            for (const utteranceId of highlight.utteranceIds) {
                await prisma.highlightedUtterance.create({
                    data: {
                        utterance: { connect: { id: utteranceId } },
                        highlight: { connect: { id: newHighlight.id } }
                    }
                });
            }
        }
    });

    console.log(`Saved highlights for meeting ${councilMeeting.id}: ${response.highlights.map(h => h.name).join(', ')}`);
}
