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
import { getPartyFromRoles, getRoleNameForPerson } from "../utils";

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
                speakerRole: person ? getRoleNameForPerson(person.roles, councilMeeting.dateTime, councilMeeting.administrativeBodyId) || null : null,
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
                return {
                    name: person.name,
                    role: getRoleNameForPerson(person.roles, councilMeeting.dateTime, councilMeeting.administrativeBodyId)
                }
            })
        })),
        date: councilMeeting.dateTime.toISOString().split('T')[0]
    };
}

let getAgendaItemIndex = (subject: DbSubject): number | "BEFORE_AGENDA" | "OUT_OF_AGENDA" | null => {
    if (subject.agendaItemIndex) return subject.agendaItemIndex;

    if (!subject.nonAgendaReason) {
        return null;
    }

    return subject.nonAgendaReason === "beforeAgenda" ? "BEFORE_AGENDA" : "OUT_OF_AGENDA";
}

export async function getSummarizeRequestBody(councilMeetingId: string, cityId: string, requestedSubjects: string[], additionalInstructions?: string): Promise<Omit<SummarizeRequest, 'callbackUrl'>> {
    const baseRequest = await getRequestOnTranscriptRequestBody(councilMeetingId, cityId);
    const existingSubjects = await getSubjectsForMeeting(cityId, councilMeetingId);
    return {
        ...baseRequest,
        requestedSubjects,
        existingSubjects: existingSubjects
            .filter(s => s.agendaItemIndex || s.nonAgendaReason)
            .map(s => ({
            name: s.name,
            description: s.description,
            introducedByPersonId: s.introducedBy?.id || null,
            topicLabel: s.topic?.name || null,
            location: s.location && s.location.coordinates ? {
                type: s.location.type,
                text: s.location.text,
                coordinates: [[s.location.coordinates.x, s.location.coordinates.y]]
            } : null,
            agendaItemIndex: getAgendaItemIndex(s)!,
            context: s.context ? {
                text: s.context,
                citationUrls: s.contextCitationUrls
            } : null,
            // NEW: Include contributions (preferred) or fallback to empty array
            speakerContributions: s.contributions.length > 0
                ? s.contributions.map(c => ({
                    speakerId: c.speakerId,
                    speakerName: c.speakerName ?? c.speaker?.name ?? null,
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

/**
 * Save subjects for a meeting using upsert semantics: matches incoming subjects
 * to existing ones by numeric agendaItemIndex and updates in-place (preserving
 * database IDs). Subjects with BEFORE_AGENDA/OUT_OF_AGENDA are always replaced
 * (old non-agenda subjects deleted, new ones created). Unmatched existing
 * subjects with numeric agendaItemIndex are left untouched — their data and
 * highlights are preserved.
 *
 * When no existing subjects are present (first run), this behaves as a pure
 * create. This preserves subject IDs that are indexed in Elasticsearch (via
 * PGSync), preventing orphaned records on re-summarize.
 */
export async function saveSubjectsForMeeting(
    subjects: Subject[],
    cityId: string,
    councilMeetingId: string,
): Promise<Map<string, string>> {
    const topics = await prisma.topic.findMany();
    const topicsByName = Object.fromEntries(topics.map(t => [t.name, t]));

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

    // Fetch existing subjects for matching
    const existingSubjects = await prisma.subject.findMany({
        where: { councilMeetingId, cityId },
        select: { id: true, agendaItemIndex: true, nonAgendaReason: true }
    });

    // Build match map: existing subjects indexed by numeric agendaItemIndex
    const existingByAgendaIndex = new Map<number, { id: string }>();
    for (const existing of existingSubjects) {
        if (existing.agendaItemIndex !== null) {
            existingByAgendaIndex.set(existing.agendaItemIndex, existing);
        }
    }

    // Categorize incoming subjects
    const toUpdate: { incoming: Subject; existingId: string }[] = [];
    const toCreate: Subject[] = [];

    for (const subject of subjects) {
        if (typeof subject.agendaItemIndex === 'number' && existingByAgendaIndex.has(subject.agendaItemIndex)) {
            const existing = existingByAgendaIndex.get(subject.agendaItemIndex)!;
            toUpdate.push({ incoming: subject, existingId: existing.id });
        } else {
            toCreate.push(subject);
        }
    }

    // Delete old BEFORE_AGENDA/OUT_OF_AGENDA subjects before creating new ones.
    // These can't be matched by agendaItemIndex (they have null), so without
    // cleanup they'd accumulate on every re-run.
    const nonAgendaSubjectIds = existingSubjects
        .filter(s => s.nonAgendaReason !== null)
        .map(s => s.id);

    console.log(`saveSubjectsForMeeting: ${toUpdate.length} to update, ${toCreate.length} to create, ${nonAgendaSubjectIds.length} non-agenda to replace, ${existingSubjects.length - toUpdate.length - nonAgendaSubjectIds.length} existing kept`);

    await prisma.$transaction(async (prisma) => {
        // Delete highlights only for subjects being updated or replaced (not unmatched ones)
        const subjectIdsBeingProcessed = [
            ...toUpdate.map(u => u.existingId),
            ...nonAgendaSubjectIds,
        ];
        if (subjectIdsBeingProcessed.length > 0) {
            await prisma.highlight.deleteMany({
                where: { meetingId: councilMeetingId, cityId, subjectId: { in: subjectIdsBeingProcessed } }
            });
        }

        // Delete old non-agenda subjects (will be recreated from incoming data)
        if (nonAgendaSubjectIds.length > 0) {
            await prisma.subject.deleteMany({
                where: { id: { in: nonAgendaSubjectIds } }
            });
        }

        // Update matched subjects in-place
        for (const { incoming, existingId } of toUpdate) {
            let locationId: string | undefined;
            if (incoming.location) {
                const cuid = await prisma.$queryRaw<[{ cuid: string }]>`
                    SELECT gen_random_uuid()::text as cuid
                `;
                const result = await prisma.$queryRaw<[{ id: string }]>`
                    INSERT INTO "Location" (id, type, text, coordinates)
                    VALUES (
                        ${cuid[0].cuid}::text,
                        ${incoming.location.type}::"LocationType",
                        ${incoming.location.text}::text,
                        ST_GeomFromGeoJSON(${JSON.stringify({
                            type: incoming.location.type === 'point' ? 'Point' :
                                  incoming.location.type === 'lineString' ? 'LineString' : 'Polygon',
                            coordinates: incoming.location.coordinates[0]
                        })})
                    )
                    RETURNING id
                `;
                locationId = result[0].id;
            }

            const validIntroducedBy = incoming.introducedByPersonId &&
                existingIntroducerIds.has(incoming.introducedByPersonId)
                    ? incoming.introducedByPersonId
                    : undefined;

            if (incoming.introducedByPersonId && !validIntroducedBy) {
                console.warn(`Person ${incoming.introducedByPersonId} not found for subject "${incoming.name}"`);
            }

            const topicId = incoming.topicLabel && topicsByName[incoming.topicLabel]
                ? topicsByName[incoming.topicLabel].id
                : null;

            console.log(`Updating subject "${incoming.name}" (${existingId}) with ${incoming.speakerContributions.length} contributions`);

            // Update the subject record in-place (preserving ID)
            await prisma.subject.update({
                where: { id: existingId },
                data: {
                    name: incoming.name,
                    description: incoming.description,
                    topicId,
                    locationId: locationId ?? null,
                    personId: validIntroducedBy ?? null,
                    topicImportance: incoming.topicImportance,
                    proximityImportance: incoming.proximityImportance,
                    context: incoming.context?.text ?? null,
                    contextCitationUrls: incoming.context?.citationUrls ?? [],
                    // Clear discussedIn — will be re-established in pass 2
                    discussedInId: null,
                }
            });

            // Delete old contributions and create new ones
            await prisma.speakerContribution.deleteMany({
                where: { subjectId: existingId }
            });

            if (incoming.speakerContributions.length > 0) {
                await prisma.speakerContribution.createMany({
                    data: incoming.speakerContributions.map(contrib => ({
                        subjectId: existingId,
                        speakerId: contrib.speakerId && validSpeakerIds.has(contrib.speakerId)
                            ? contrib.speakerId
                            : null,
                        speakerName: contrib.speakerName,
                        text: contrib.text
                    }))
                });
            }

            const apiIdentifier = incoming.id || incoming.name;
            subjectIdMap.set(apiIdentifier, existingId);

            // Create highlight with extracted utterances
            const utteranceIds = extractUtteranceIdsFromContributions(incoming.speakerContributions);
            if (utteranceIds.length > 0) {
                const highlight = await prisma.highlight.create({
                    data: {
                        name: incoming.name,
                        meeting: {
                            connect: { cityId_id: { cityId, id: councilMeetingId } }
                        },
                        subject: { connect: { id: existingId } }
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

        // Create new subjects (BEFORE_AGENDA, OUT_OF_AGENDA, or unmatched numeric)
        for (const subject of toCreate) {
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

            const validIntroducedBy = subject.introducedByPersonId &&
                existingIntroducerIds.has(subject.introducedByPersonId)
                    ? subject.introducedByPersonId
                    : undefined;

            if (subject.introducedByPersonId && !validIntroducedBy) {
                console.warn(`Person ${subject.introducedByPersonId} not found for subject "${subject.name}"`);
            }

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
                    topicImportance: subject.topicImportance,
                    proximityImportance: subject.proximityImportance,
                    contributions: {
                        create: subject.speakerContributions.map(contrib => ({
                            speakerId: contrib.speakerId && validSpeakerIds.has(contrib.speakerId)
                                ? contrib.speakerId
                                : null,
                            speakerName: contrib.speakerName,
                            text: contrib.text
                        }))
                    },
                    context: subject.context?.text,
                    contextCitationUrls: subject.context?.citationUrls
                }
            });

            const apiIdentifier = subject.id || subject.name;
            subjectIdMap.set(apiIdentifier, createdSubject.id);

            const utteranceIds = extractUtteranceIdsFromContributions(
                subject.speakerContributions
            );

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

    // Pass 2: Update subjects with discussedIn references
    // This must happen after all subjects are created so we can map API IDs to DB IDs
    const subjectsWithDiscussedIn = subjects.filter(s => s.discussedIn);

    if (subjectsWithDiscussedIn.length > 0) {
        for (const subject of subjectsWithDiscussedIn) {
            const apiIdentifier = subject.id || subject.name;
            const subjectDbId = subjectIdMap.get(apiIdentifier);
            const primarySubjectDbId = subjectIdMap.get(subject.discussedIn!);

            if (subjectDbId && primarySubjectDbId) {
                await prisma.subject.update({
                    where: { id: subjectDbId },
                    data: {
                        discussedIn: { connect: { id: primarySubjectDbId } }
                    }
                });
            } else {
                console.warn(`Could not link subject "${subject.name}" to primary subject "${subject.discussedIn}"`);
            }
        }
    }

    return subjectIdMap;
}
