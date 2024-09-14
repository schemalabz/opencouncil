"use server";
import { City, CouncilMeeting, Party, Person, SpeakerSegment, Summary } from "@prisma/client";
import prisma from "@/lib/db/prisma";

export type SearchRequest = {
    query: string;
    cityId?: string;
    personId?: string;
    partyId?: string;
}

export type SearchResult = {
    city: City;
    councilMeeting: CouncilMeeting;
    speakerSegment: SpeakerSegment & {
        person?: Person;
        party?: Party;
        summary?: Summary;
        text?: string;
    }
};


export async function search(request: SearchRequest): Promise<SearchResult[]> {
    const { cityId, personId, partyId } = request;

    const results = await prisma.speakerSegment.findMany({
        where: {
            cityId: cityId,
            speakerTag: {
                person: {
                    id: personId,
                    partyId: partyId
                }
            }
        },
        include: {
            meeting: {
                include: {
                    city: true
                }
            },
            speakerTag: {
                include: {
                    person: {
                        include: {
                            party: true
                        }
                    }
                }
            },
            summary: true,
            utterances: true
        },
        take: 10
    });

    return results.map(result => ({
        city: result.meeting.city,
        councilMeeting: result.meeting,
        speakerSegment: {
            ...result,
            person: result.speakerTag?.person || undefined,
            party: result.speakerTag?.person?.party || undefined,
            summary: result.summary || undefined,
            text: result.utterances.map(u => u.text).join(" ")
        }
    }));
}