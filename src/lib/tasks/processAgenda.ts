"use server";

import { ProcessAgendaRequest, ProcessAgendaResult } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { createSubjectsForMeeting } from "../db/utils";
import { withUserAuthorizedToEdit } from "../auth";
import { getAllTopics } from "../db/topics";
import { getPartyFromRoles, getRoleNameForPerson } from "../utils";
import { getPeopleForMeeting } from "../db/people";

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
    const topicLabels = await getAllTopics();

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
            councilMeeting: {
                include: {
                    administrativeBody: true,
                    city: true
                }
            }
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

    // Create notifications if administrative body allows it
    const adminBody = task.councilMeeting.administrativeBody;
    if (adminBody && adminBody.notificationBehavior !== 'NOTIFICATIONS_DISABLED') {
        const { createNotificationsForMeeting } = await import('../db/notifications');
        const { releaseNotifications } = await import('../notifications/deliver');
        const { sendNotificationsCreatedAdminAlert, sendNotificationsSentAdminAlert } = await import('../discord');

        try {
            const stats = await createNotificationsForMeeting(
                task.councilMeeting.cityId,
                task.councilMeeting.id,
                'beforeMeeting'
            );

            console.log(`Created ${stats.notificationsCreated} beforeMeeting notifications for ${stats.subjectsTotal} subjects`);

            const autoSend = adminBody.notificationBehavior === 'NOTIFICATIONS_AUTO';

            // Send Discord admin alert about notification creation
            if (stats.notificationsCreated > 0) {
                sendNotificationsCreatedAdminAlert({
                    cityName: task.councilMeeting.city.name_en,
                    meetingName: task.councilMeeting.name,
                    notificationType: 'beforeMeeting',
                    notificationsCreated: stats.notificationsCreated,
                    subjectsTotal: stats.subjectsTotal,
                    cityId: task.councilMeeting.cityId,
                    meetingId: task.councilMeeting.id,
                    autoSend
                });
            }

            // If auto-send is enabled, release notifications immediately
            if (autoSend) {
                console.log('Auto-sending notifications...');
                const releaseResult = await releaseNotifications(stats.notificationIds);
                console.log(`Released notifications: ${releaseResult.emailsSent} emails, ${releaseResult.messagesSent} messages sent`);

                // Send Discord admin alert about sending
                sendNotificationsSentAdminAlert({
                    notificationCount: stats.notificationsCreated,
                    emailsSent: releaseResult.emailsSent,
                    messagesSent: releaseResult.messagesSent,
                    failed: releaseResult.failed
                });
            }
        } catch (error) {
            console.error('Error creating notifications after processAgenda:', error);
            // Don't throw - we don't want to fail the entire task if notifications fail
        }
    }
}