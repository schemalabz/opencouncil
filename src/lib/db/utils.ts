"use server"

import { getTranscript } from "./transcript";
import { getPeopleForCity, getPeopleForMeeting } from "./people";
import { getPartiesForCity } from "./parties";
import { getAllTopics } from "./topics";
import { getCity } from "./cities";
import { getCouncilMeeting } from "./meetings";
import { RequestOnTranscript, SummarizeRequest, TranscribeRequest, Subject } from "../apiTypes";
import prisma from "./prisma";
import { getSubjectsForMeeting } from "./subject";
import { Subject as DbSubject } from "@prisma/client";
import { getPartyFromRoles, getSingleCityRole } from "../utils";

export async function getRequestOnTranscriptRequestBody(councilMeetingId: string, cityId: string): Promise<Omit<RequestOnTranscript, 'callbackUrl'>> {
    const transcript = await getTranscript(councilMeetingId, cityId, { joinAdjacentSameSpeakerSegments: true });
    const councilMeeting = await getCouncilMeeting(cityId, councilMeetingId);

    if (!councilMeeting) {
        throw new Error('Council meeting not found');
    }

    // Get relevant people based on meeting's administrative body
    const people = await getPeopleForMeeting(cityId, councilMeeting.administrativeBodyId);
    const parties = await getPartiesForCity(cityId);
    const topics = await getAllTopics();
    const city = await getCity(cityId);

    if (!city) {
        throw new Error('City not found');
    }

    return {
        transcript: transcript.map(segment => {
            const speakerTag = segment.speakerTag;
            const person = people.find(p => p.id === speakerTag.personId);
            const party = person ? getPartyFromRoles(person.roles) : null;

            return {
                speakerName: person?.name || speakerTag.label,
                speakerParty: party?.name || null,
                speakerRole: getSingleCityRole(person?.roles || [], councilMeeting.dateTime, councilMeeting.administrativeBodyId || undefined)?.name || null,
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
            people: people.filter(person => {
                const party = getPartyFromRoles(person.roles, councilMeeting.dateTime);
                return party?.id === p.id;
            }).map((person) => {
                const cityRole = getSingleCityRole(person.roles, councilMeeting.dateTime, councilMeeting.administrativeBodyId || undefined);
                return {
                    name: person.name,
                    role: cityRole?.name || ''
                }
            })
        })),
        date: councilMeeting.dateTime.toISOString().split('T')[0]
    };
}

let getAgendaItemIndex = (subject: DbSubject): number | "BEFORE_AGENDA" | "OUT_OF_AGENDA" => {
    if (subject.agendaItemIndex) return subject.agendaItemIndex;

    if (!subject.nonAgendaReason) {
        throw new Error(`Subject ${subject.name} (${subject.id}) has no agenda item index and no non-agenda reason`);
    }

    return subject.nonAgendaReason === "beforeAgenda" ? "BEFORE_AGENDA" : "OUT_OF_AGENDA";
}

export async function getSummarizeRequestBody(councilMeetingId: string, cityId: string, requestedSubjects: string[], additionalInstructions?: string): Promise<Omit<SummarizeRequest, 'callbackUrl'>> {
    const baseRequest = await getRequestOnTranscriptRequestBody(councilMeetingId, cityId);
    const existingSubjects = await getSubjectsForMeeting(cityId, councilMeetingId);
    return {
        ...baseRequest,
        requestedSubjects,
        existingSubjects: existingSubjects.map(s => ({
            ...s,
            highlightedUtteranceIds: [],
            introducedByPersonId: s.introducedBy?.id || null,
            topicLabel: s.topic?.name || null,
            location: s.location && s.location.coordinates ? {
                type: s.location.type,
                text: s.location.text,
                coordinates: [[s.location.coordinates.x, s.location.coordinates.y]]
            } : null,
            agendaItemIndex: getAgendaItemIndex(s),
            context: s.context ? {
                text: s.context,
                citationUrls: s.contextCitationUrls
            } : null
        })),
        additionalInstructions
    };
}

export async function getAvailableSpeakerSegmentIds(councilMeetingId: string, cityId: string): Promise<string[]> {
    const speakerSegments = await prisma.speakerSegment.findMany({
        select: {
            id: true
        },
        where: {
            meetingId: councilMeetingId,
            cityId
        }
    });
    return speakerSegments.map(s => s.id);
}

export async function createSubjectsForMeeting(
    subjects: Subject[],
    cityId: string,
    councilMeetingId: string,
) {
    const topics = await prisma.topic.findMany();
    const topicsByName = Object.fromEntries(topics.map(t => [t.name, t]));

    const availableSpeakerSegmentIds = await getAvailableSpeakerSegmentIds(councilMeetingId, cityId);

    // Collect all person IDs we need to validate
    const personIdsToCheck = subjects
        .filter(subject => subject.introducedByPersonId)
        .map(subject => subject.introducedByPersonId)
        .filter(Boolean) as string[];

    // Check if all person IDs exist
    const existingPersons = personIdsToCheck.length > 0
        ? await prisma.person.findMany({
            where: {
                id: { in: personIdsToCheck },
                cityId // Also ensure the person belongs to the correct city
            },
            select: { id: true }
        })
        : [];

    const existingPersonIds = new Set(existingPersons.map(p => p.id));

    await prisma.$transaction(async (prisma) => {
        // Delete old highlights and subjects for this meeting
        await prisma.highlight.deleteMany({
            where: {
                meetingId: councilMeetingId,
                cityId
            }
        });
        await prisma.subject.deleteMany({
            where: {
                councilMeetingId,
                cityId
            }
        });

        // Create new subjects and highlights
        for (const subject of subjects) {
            // Create location if provided
            let locationId: string | undefined;
            if (subject.location) {
                // Create location using raw SQL since PostGIS geometry is unsupported in Prisma
                const cuid = await prisma.$queryRaw<[{ cuid: string }]>`SELECT gen_random_uuid()::text as cuid`;
                const result = await prisma.$queryRaw<[{ id: string }]>`
                    INSERT INTO "Location" (id, type, text, coordinates)
                    VALUES (
                        ${cuid[0].cuid}::text,
                        ${subject.location.type}::"LocationType",
                        ${subject.location.text}::text,
                        ST_GeomFromGeoJSON(${JSON.stringify({
                    type: subject.location.type === 'point' ? 'Point' :
                        subject.location.type === 'lineString' ? 'LineString' : 'Polygon',
                    coordinates: subject.location.coordinates[0]
                })})
                    )
                    RETURNING id
                `;
                locationId = result[0].id;
            }

            // Filter out invalid speaker segments
            const validSpeakerSegments = subject.speakerSegments.filter(segment => {
                if (!segment.speakerSegmentId) {
                    console.warn(`Warning: Found speaker segment with missing ID in subject "${subject.name}"`);
                    return false;
                }
                if (!availableSpeakerSegmentIds.includes(segment.speakerSegmentId)) {
                    console.log(`Speaker segment ${segment.speakerSegmentId} does not exist -- ignoring`);
                    return false;
                }
                return true;
            });

            // Validate that person exists before connecting
            const validIntroducedByPersonId = subject.introducedByPersonId &&
                existingPersonIds.has(subject.introducedByPersonId) ?
                subject.introducedByPersonId : undefined;

            if (subject.introducedByPersonId && !validIntroducedByPersonId) {
                console.warn(`Warning: Person with ID ${subject.introducedByPersonId} not found for subject "${subject.name}" - skipping person connection`);
            }

            console.log(`Creating subject "${subject.name}" with ${validSpeakerSegments.length} speaker segments -- introduced by ${validIntroducedByPersonId || 'none'}`);
            const createdSubject = await prisma.subject.create({
                data: {
                    name: subject.name,
                    description: subject.description,
                    councilMeeting: { connect: { cityId_id: { cityId, id: councilMeetingId } } },
                    location: locationId ? { connect: { id: locationId } } : undefined,
                    topic: subject.topicLabel && topicsByName[subject.topicLabel] ?
                        { connect: { id: topicsByName[subject.topicLabel].id } } :
                        undefined,
                    agendaItemIndex: typeof subject.agendaItemIndex === "number" ? subject.agendaItemIndex : undefined,
                    nonAgendaReason: subject.agendaItemIndex === "BEFORE_AGENDA" ? "beforeAgenda" : "outOfAgenda",
                    introducedBy: validIntroducedByPersonId ?
                        { connect: { id: validIntroducedByPersonId } } :
                        undefined,
                    speakerSegments: validSpeakerSegments.length > 0 ? {
                        create: validSpeakerSegments.map(segment => ({
                            speakerSegment: { connect: { id: segment.speakerSegmentId } },
                            summary: segment.summary
                        }))
                    } : undefined,
                    context: subject.context?.text,
                    contextCitationUrls: subject.context?.citationUrls
                }
            });

            const highlight = await prisma.highlight.create({
                data: {
                    name: subject.name,
                    meeting: { connect: { cityId_id: { cityId, id: councilMeetingId } } },
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
    }, { timeout: 60000 });
}
