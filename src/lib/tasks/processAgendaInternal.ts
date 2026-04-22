import { ProcessAgendaRequest } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { getActiveTopicsForTasks } from "../db/topics";
import { getPartyFromRoles, getRoleNameForPerson } from "../utils";
import { getPeopleForMeeting } from "../db/people";

/**
 * Core processAgenda logic without auth checks.
 *
 * NOT in a "use server" file — this must not be callable as a Server Action.
 * Only called from:
 *   - The meeting creation API route (after withServiceOrUserAuth)
 *   - requestProcessAgenda (after withUserAuthorizedToEdit)
 */
export async function requestProcessAgendaInternal(agendaUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
    console.log(`Requesting agenda processing for ${agendaUrl}`);
    const councilMeeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                id: councilMeetingId,
                cityId
            }
        },
        include: {
            subjects: {
                select: {
                    id: true
                },
                take: 1
            },
            city: {
                select: {
                    name: true
                }
            }
        }
    });

    if (!councilMeeting) {
        throw new Error("Council meeting not found");
    }

    if (councilMeeting.subjects.length > 0) {
        if (force) {
            console.log(`Deleting existing subjects for meeting ${councilMeetingId}`);
            // Delete auto-generated subject-linked highlights before subjects to avoid orphans.
            // User-created highlights (createdById is set) are preserved — their subjectId
            // will be set to null by the onDelete: SetNull cascade when subjects are deleted.
            await prisma.highlight.deleteMany({
                where: { meetingId: councilMeetingId, cityId, subjectId: { not: null }, createdById: null }
            });
            await prisma.subject.deleteMany({
                where: {
                    councilMeetingId,
                    cityId
                }
            });
        } else {
            console.log(`Meeting already has subjects`);
            throw new Error('Meeting already has subjects');
        }
    }

    // Get relevant people for the meeting (filtered by administrative body)
    const people = await getPeopleForMeeting(cityId, councilMeeting.administrativeBodyId);
    const topicLabels = await getActiveTopicsForTasks();

    // Build people array with deduplication by ID (keep last entry)
    const peopleMap = new Map();
    for (const p of people) {
        const roleName = getRoleNameForPerson(p.roles, councilMeeting.dateTime, councilMeeting.administrativeBodyId);
        const party = getPartyFromRoles(p.roles, councilMeeting.dateTime);

        peopleMap.set(p.id, {
            id: p.id,
            name: p.name, // Use full name, not name_short
            role: roleName,
            party: party?.name || ''
        });
    }

    console.log(`ProcessAgenda people array:`, Array.from(peopleMap.values()));

    const body: Omit<ProcessAgendaRequest, 'callbackUrl'> = {
        agendaUrl,
        date: councilMeeting.dateTime.toISOString(),
        people: Array.from(peopleMap.values()),
        topicLabels: topicLabels.map(t => ({ name: t.name, description: t.description })),
        cityName: councilMeeting.city.name
    }

    console.log(`Process agenda body: ${JSON.stringify(body)}`);
    return startTask('processAgenda', body, councilMeetingId, cityId, { force });
}
