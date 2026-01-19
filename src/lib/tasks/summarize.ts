"use server";
import { CouncilMeeting, Prisma, SpeakerSegment } from "@prisma/client";
import { Utterance as ApiUtterance, SummarizeRequest, SummarizeResult } from "../apiTypes";
import { getTranscript } from "../db/transcript";
import { getPartiesForCity } from "../db/parties";
import { getAllTopics } from "../db/topics";
import { startTask } from "./tasks";
import { getCity } from "../db/cities";
import { getCouncilMeeting } from "../db/meetings";
import prisma from "../db/prisma";
import { getAvailableSpeakerSegmentIds, getSummarizeRequestBody } from "../db/utils";
import { createSubjectsForMeeting } from "../db/utils";
import { withUserAuthorizedToEdit } from "../auth";

export async function requestSummarize(cityId: string, councilMeetingId: string, requestedSubjects: string[] = [], additionalInstructions?: string) {
    await withUserAuthorizedToEdit({ cityId });

    const body = await getSummarizeRequestBody(councilMeetingId, cityId, requestedSubjects, additionalInstructions);

    return startTask('summarize', body, councilMeetingId, cityId);
}

export async function handleSummarizeResult(taskId: string, response: SummarizeResult) {
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

    const { councilMeeting } = task;

    const availableSpeakerSegmentIds = await getAvailableSpeakerSegmentIds(councilMeeting.id, councilMeeting.cityId);

    // Speaker segment transaction
    await prisma.$transaction(async (prisma) => {
        for (const segmentSummary of response.speakerSegmentSummaries) {
            if (!availableSpeakerSegmentIds.includes(segmentSummary.speakerSegmentId)) {
                console.log(`Speaker segment ${segmentSummary.speakerSegmentId} not found`);
                continue;
            }

            // Update or create summary
            await prisma.summary.upsert({
                where: {
                    speakerSegmentId: segmentSummary.speakerSegmentId
                },
                update: {
                    text: segmentSummary.summary || '',
                    type: segmentSummary.type === "PROCEDURAL" ? "procedural" : "substantive"
                },
                create: {
                    text: segmentSummary.summary || '',
                    type: segmentSummary.type === "PROCEDURAL" ? "procedural" : "substantive",
                    speakerSegment: { connect: { id: segmentSummary.speakerSegmentId } }
                }
            });

            // Update topic labels
            if (segmentSummary.topicLabels) {
                for (const topicLabel of segmentSummary.topicLabels) {
                    const topic = await prisma.topic.findFirst({
                        where: { name: topicLabel }
                    });
                    if (topic) {
                        await prisma.topicLabel.upsert({
                            where: {
                                id: `${segmentSummary.speakerSegmentId}_${topic.id}`
                            },
                            update: {},
                            create: {
                                id: `${segmentSummary.speakerSegmentId}_${topic.id}`,
                                speakerSegment: { connect: { id: segmentSummary.speakerSegmentId } },
                                topic: { connect: { id: topic.id } }
                            }
                        });
                    } else {
                        console.log(`Topic not found: ${topicLabel}`);
                    }
                }
            }
        }
    }, { timeout: 120000 });

    // Create subjects and get mapping from API subject IDs/names to database IDs
    const subjectNameToIdMap = await createSubjectsForMeeting(
        response.subjects,
        councilMeeting.cityId,
        councilMeeting.id
    );

    console.log(`Saved summaries and topic labels for meeting ${councilMeeting.id}`);

    // Save utterance discussion statuses
    if (response.utteranceDiscussionStatuses && response.utteranceDiscussionStatuses.length > 0) {
        await prisma.$transaction(async (prisma) => {
            for (const utteranceStatus of response.utteranceDiscussionStatuses) {
                // Map the API subject identifier to the database subject ID
                // The API provides subject.id (or falls back to subject.name) which we mapped during creation
                const dbSubjectId = utteranceStatus.subjectId ? subjectNameToIdMap.get(utteranceStatus.subjectId) : null;

                if (utteranceStatus.subjectId && !dbSubjectId) {
                    console.warn(`Could not find database subject for API subject ID: ${utteranceStatus.subjectId}`);
                }

                await prisma.utterance.update({
                    where: {
                        id: utteranceStatus.utteranceId
                    },
                    data: {
                        discussionStatus: utteranceStatus.status,
                        discussionSubjectId: dbSubjectId || null
                    }
                });
            }
        }, { timeout: 120000 });

        console.log(`Saved ${response.utteranceDiscussionStatuses.length} utterance discussion statuses`);
    }

    // Create notifications if administrative body allows it
    const adminBody = councilMeeting.administrativeBody;
    if (adminBody && adminBody.notificationBehavior !== 'NOTIFICATIONS_DISABLED') {
        const { createNotificationsForMeeting } = await import('../db/notifications');
        const { releaseNotifications } = await import('../notifications/deliver');
        const { sendNotificationsCreatedAdminAlert, sendNotificationsSentAdminAlert } = await import('../discord');

        try {
            const stats = await createNotificationsForMeeting(
                councilMeeting.cityId,
                councilMeeting.id,
                'afterMeeting'
            );

            console.log(`Created ${stats.notificationsCreated} afterMeeting notifications for ${stats.subjectsTotal} subjects`);

            const autoSend = adminBody.notificationBehavior === 'NOTIFICATIONS_AUTO';

            // Send Discord admin alert about notification creation
            if (stats.notificationsCreated > 0) {
                sendNotificationsCreatedAdminAlert({
                    cityName: councilMeeting.city.name_en,
                    meetingName: councilMeeting.name,
                    notificationType: 'afterMeeting',
                    notificationsCreated: stats.notificationsCreated,
                    subjectsTotal: stats.subjectsTotal,
                    cityId: councilMeeting.cityId,
                    meetingId: councilMeeting.id,
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
            console.error('Error creating notifications after summarize:', error);
            // Don't throw - we don't want to fail the entire task if notifications fail
        }
    }
}
