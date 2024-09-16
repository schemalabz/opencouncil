"use server";
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
        transcript: transcript.map(segment => {
            const speakerTag = segment.speakerTag;
            const person = people.find(p => p.id === speakerTag.personId);
            const party = parties.find(p => p.id === person?.partyId);

            const ret: ExtractHighlightsRequest['transcript'][number] = {
                speakerName: person?.name || speakerTag.label,
                speakerParty: party?.name || null,
                speakerSegmentId: segment.id,
                utterances: segment.utterances.map(u => ({
                    text: u.text,
                    utteranceId: u.id
                }))
            }

            return ret;
        }),
        topicLabels: topics.map(t => t.name),
        cityName: city.name,
        date: councilMeeting.dateTime.toISOString().split('T')[0],
    }

    return startTask('extract-highlights', body, councilMeetingId, cityId);
}

import prisma from "../db/prisma";
import { ExtractHighlightsResult } from "../apiTypes";

export async function handleExtractHighlightsResult(taskId: string, response: ExtractHighlightsResult) {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        include: { councilMeeting: true }
    });

    if (!task) {
        throw new Error('Task not found');
    }

    const { councilMeeting } = task;
    // Start a transaction
    await prisma.$transaction(async (prisma) => {
        const missingUtterances = [];
        for (const highlight of response.highlights) {
            console.log(`Processing highlight: ${highlight.name}`);

            // Create a new Highlight
            const newHighlight = await prisma.highlight.create({
                data: {
                    name: highlight.name,
                    meeting: { connect: { cityId_id: { cityId: councilMeeting.cityId, id: councilMeeting.id } } }
                }
            });

            for (const utteranceId of highlight.utteranceIds) {
                console.log(`Attempting to connect Utterance ID: ${utteranceId}`);

                // Verify Utterance exists
                const utteranceExists = await prisma.utterance.findUnique({
                    where: { id: utteranceId }
                });

                if (!utteranceExists) {
                    console.warn(`Utterance with ID ${utteranceId} does not exist.`);
                    missingUtterances.push(utteranceId);
                    continue;
                }

                await prisma.highlightedUtterance.create({
                    data: {
                        utterance: { connect: { id: utteranceId } },
                        highlight: { connect: { id: newHighlight.id } }
                    }
                });
            }
        }

        if (missingUtterances.length > 0) {
            console.warn(`The following utterances were missing: ${missingUtterances.join(', ')}`);
        }
    });

    console.log(`Saved highlights for meeting ${councilMeeting.id}: ${response.highlights.map(h => h.name).join(', ')}`);
}
