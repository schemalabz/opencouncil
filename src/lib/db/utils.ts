"use server"

import { getTranscript } from "./transcript";
import { getPeopleForCity } from "./people";
import { getPartiesForCity } from "./parties";
import { getAllTopics } from "./topics";
import { getCity } from "./cities";
import { getCouncilMeeting } from "./meetings";
import { RequestOnTranscript, SummarizeRequest, TranscribeRequest } from "../apiTypes";

export async function getRequestOnTranscriptRequestBody(councilMeetingId: string, cityId: string): Promise<Omit<RequestOnTranscript, 'callbackUrl'>> {
    const transcript = await getTranscript(councilMeetingId, cityId);
    const people = await getPeopleForCity(cityId);
    const parties = await getPartiesForCity(cityId);
    const topics = await getAllTopics();
    const city = await getCity(cityId);
    const councilMeeting = await getCouncilMeeting(cityId, councilMeetingId);

    if (!city || !councilMeeting) {
        throw new Error('City or council meeting not found');
    }

    return {
        transcript: transcript.map(segment => {
            const speakerTag = segment.speakerTag;
            const person = people.find(p => p.id === speakerTag.personId);
            const party = parties.find(p => p.id === person?.partyId);

            return {
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
            };
        }),
        topicLabels: topics.map(t => t.name),
        cityName: city.name,
        partiesWithPeople: parties.map(p => ({
            name: p.name,
            people: people.filter(person => person.partyId === p.id).map(person => ({
                name: person.name,
                role: person.role || ''
            }))
        })),
        date: councilMeeting.dateTime.toISOString().split('T')[0]
    };
}

export async function getSummarizeRequestBody(councilMeetingId: string, cityId: string, requestedSubjects: string[], additionalInstructions?: string): Promise<Omit<SummarizeRequest, 'callbackUrl'>> {
    const baseRequest = await getRequestOnTranscriptRequestBody(councilMeetingId, cityId);

    return {
        ...baseRequest,
        requestedSubjects,
        additionalInstructions
    };
}
