"use server";

import { ProcessAgendaRequest, ProcessAgendaResult } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { createSubjectsForMeeting } from "../db/utils";
import { withUserAuthorizedToEdit } from "../auth";
import { getAllTopics } from "../db/topics";

export async function requestProcessAgenda(agendaUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
    await withUserAuthorizedToEdit({ cityId });
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
                include: {
                    persons: {
                        include: {
                            party: true
                        }
                    }
                }
            },
        }
    });

    const topicLabels = await getAllTopics();

    if (!councilMeeting) {
        throw new Error("Council meeting not found");
    }

    if (councilMeeting.subjects.length > 0) {
        if (force) {
            console.log(`Deleting existing subjects for meeting ${councilMeetingId}`);
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

    const body: Omit<ProcessAgendaRequest, 'callbackUrl'> = {
        agendaUrl,
        date: councilMeeting.dateTime.toISOString(),
        people: councilMeeting.city.persons.map(p => ({
            id: p.id,
            name: p.name_short,
            role: p.role || '',
            party: p.party?.name || ''
        })),
        topicLabels: topicLabels.map(t => t.name),
        cityName: councilMeeting.city.name
    }

    console.log(`Process agenda body: ${JSON.stringify(body)}`);
    return startTask('processAgenda', body, councilMeetingId, cityId, { force });
}

export async function handleProcessAgendaResult(taskId: string, response: ProcessAgendaResult) {
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

    await createSubjectsForMeeting(
        response.subjects,
        task.councilMeeting.cityId,
        task.councilMeeting.id
    );
}