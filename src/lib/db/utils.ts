"use server"

import { getTranscript } from "./transcript";
import { getPeopleForCity, getPeopleForMeeting } from "./people";
import { getPartiesForCity } from "./parties";
import { getAllTopics } from "./topics";
import { getCity } from "./cities";
import { getCouncilMeeting } from "./meetings";
import { RequestOnTranscript, SummarizeRequest, TranscribeRequest, Subject } from "../apiTypes";
import prisma from "./prisma";
import { getSubjectsForMeeting, extractUtteranceIdsFromContributions } from "./subject";
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
                speakerId: person?.id || null, // NEW: personId from voiceprint match
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
        administrativeBodyName: councilMeeting.administrativeBody?.name || null,
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
            name: s.name,
            description: s.description,
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
            } : null,
            // NEW: Include contributions (preferred) or fallback to empty array
            speakerContributions: s.contributions.length > 0
                ? s.contributions.map(c => ({
                    speakerId: c.speakerId,
                    text: c.text
                }))
                : [], // Backend will handle empty contributions
            // NEW: Include importance fields if they exist
            topicImportance: (s.topicImportance as any) || 'normal',
            proximityImportance: (s.proximityImportance as any) || 'none'
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
): Promise<Map<string, string>> {
    const topics = await prisma.topic.findMany();
    const topicsByName = Object.fromEntries(topics.map(t => [t.name, t]));

    // Map to store API subject identifiers (ID or name) to database subject IDs
    const subjectIdMap = new Map<string, string>();

    // Validate persons exist for contributions
    const speakerIds = subjects
        .flatMap(s => s.speakerContributions.map(c => c.speakerId))
        .filter(Boolean) as string[];

    const existingPersons = speakerIds.length > 0
        ? await prisma.person.findMany({
            where: { id: { in: speakerIds }, cityId },
            select: { id: true }
        })
        : [];

    const validSpeakerIds = new Set(existingPersons.map(p => p.id));

    // Validate introducedBy persons
    const personIdsToCheck = subjects
        .map(s => s.introducedByPersonId)
        .filter(Boolean) as string[];

    const existingIntroducers = personIdsToCheck.length > 0
        ? await prisma.person.findMany({
            where: { id: { in: personIdsToCheck }, cityId },
            select: { id: true }
        })
        : [];

    const existingIntroducerIds = new Set(existingIntroducers.map(p => p.id));

    await prisma.$transaction(async (prisma) => {
        // Delete old highlights and subjects
        await prisma.highlight.deleteMany({
            where: { meetingId: councilMeetingId, cityId }
        });
        await prisma.subject.deleteMany({
            where: { councilMeetingId, cityId }
        });

        for (const subject of subjects) {
            // Create location (unchanged)
            let locationId: string | undefined;
            if (subject.location) {
                const cuid = await prisma.$queryRaw<[{ cuid: string }]>`
                    SELECT gen_random_uuid()::text as cuid
                `;
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

            // Validate introducedBy
            const validIntroducedBy = subject.introducedByPersonId &&
                existingIntroducerIds.has(subject.introducedByPersonId)
                    ? subject.introducedByPersonId
                    : undefined;

            if (subject.introducedByPersonId && !validIntroducedBy) {
                console.warn(`Person ${subject.introducedByPersonId} not found for subject "${subject.name}"`);
            }

            // Create subject with contributions
            console.log(`Creating subject "${subject.name}" with ${subject.speakerContributions.length} contributions`);

            const createdSubject = await prisma.subject.create({
                data: {
                    name: subject.name,
                    description: subject.description,
                    councilMeeting: {
                        connect: { cityId_id: { cityId, id: councilMeetingId } }
                    },
                    location: locationId ? { connect: { id: locationId } } : undefined,
                    topic: subject.topicLabel && topicsByName[subject.topicLabel]
                        ? { connect: { id: topicsByName[subject.topicLabel].id } }
                        : undefined,
                    agendaItemIndex: typeof subject.agendaItemIndex === 'number'
                        ? subject.agendaItemIndex
                        : undefined,
                    nonAgendaReason: subject.agendaItemIndex === 'BEFORE_AGENDA'
                        ? 'beforeAgenda'
                        : subject.agendaItemIndex === 'OUT_OF_AGENDA'
                            ? 'outOfAgenda'
                            : undefined,
                    introducedBy: validIntroducedBy
                        ? { connect: { id: validIntroducedBy } }
                        : undefined,

                    // NEW: Add importance fields
                    topicImportance: subject.topicImportance,
                    proximityImportance: subject.proximityImportance,

                    // NEW: Create contributions
                    contributions: {
                        create: subject.speakerContributions.map(contrib => ({
                            speakerId: contrib.speakerId && validSpeakerIds.has(contrib.speakerId)
                                ? contrib.speakerId
                                : null,
                            text: contrib.text
                        }))
                    },

                    // Keep context unchanged
                    context: subject.context?.text,
                    contextCitationUrls: subject.context?.citationUrls
                }
            });

            // Map API subject identifier to database ID for utterance discussion status mapping
            // Use subject.id if provided by API, otherwise use subject.name
            const apiIdentifier = subject.id || subject.name;
            subjectIdMap.set(apiIdentifier, createdSubject.id);

            // Extract utterance IDs from contribution references for highlight
            const utteranceIds = extractUtteranceIdsFromContributions(
                subject.speakerContributions
            );

            // Create highlight with extracted utterances
            if (utteranceIds.length > 0) {
                const highlight = await prisma.highlight.create({
                    data: {
                        name: subject.name,
                        meeting: {
                            connect: { cityId_id: { cityId, id: councilMeetingId } }
                        },
                        subject: { connect: { id: createdSubject.id } }
                    }
                });

                await prisma.highlightedUtterance.createMany({
                    data: utteranceIds.map(utteranceId => ({
                        utteranceId,
                        highlightId: highlight.id
                    }))
                });
            }
        }
    }, { timeout: 60000 });

    return subjectIdMap;
}
