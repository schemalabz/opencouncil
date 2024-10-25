"use server"

import { getTranscript } from "./transcript";
import { getPeopleForCity } from "./people";
import { getPartiesForCity } from "./parties";
import { getAllTopics } from "./topics";
import { getCity } from "./cities";
import { getCouncilMeeting } from "./meetings";
import { SummarizeRequest } from "../apiTypes";

export async function getSummarizeRequestBody(councilMeetingId: string, cityId: string, requestedSubjects: string[], additionalInstructions?: string): Promise<Omit<SummarizeRequest, 'callbackUrl'>> {
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
        requestedSubjects,
        transcript: transcript.map(segment => {
            const speakerTag = segment.speakerTag;
            const person = people.find(p => p.id === speakerTag.personId);
            const party = parties.find(p => p.id === person?.partyId);

            const ret: SummarizeRequest['transcript'][number] = {
                speakerName: person?.name || speakerTag.label,
                speakerParty: party?.name || null,
                speakerRole: person?.role || null,
                speakerSegmentId: segment.id,
                text: segment.utterances.map(u => u.text).join(' '),
                utterances: segment.utterances.map(u => ({
                    text: u.text,
                    utteranceId: u.id,
                    startTimestamp: u.startTimestamp,
                    endTimestamp: u.endTimestamp
                }))
            }

            return ret;
        }),
        topicLabels: topics.map(t => t.name),
        cityName: city.name,
        date: councilMeeting.dateTime.toISOString().split('T')[0],
        additionalInstructions
    }

    return body;
}
