"use server";
import { CouncilMeeting, Prisma, SpeakerSegment } from "@prisma/client";
import { Utterance as ApiUtterance, SummarizeRequest, SummarizeResult } from "../apiTypes";
import { getTranscript } from "../db/transcript";
import { getPartiesForCity } from "../db/parties";
import { startTask } from "./tasks";
import { getCity } from "../db/cities";
import { getCouncilMeeting } from "../db/meetings";
import prisma from "../db/prisma";
import { revalidateMeeting } from "../cache";
import { getAvailableSpeakerSegmentIds, getSummarizeRequestBody, saveSubjectsForMeeting } from "../db/utils";
import { withUserAuthorizedToEdit } from "../auth";

export async function requestSummarize(cityId: string, councilMeetingId: string, requestedSubjects: string[] = [], additionalInstructions?: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
    await withUserAuthorizedToEdit({ cityId });

    const body = await getSummarizeRequestBody(councilMeetingId, cityId, requestedSubjects, additionalInstructions, { force });

    return startTask('summarize', body, councilMeetingId, cityId, { force });
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

    // Pre-fetch all topics to avoid repeated queries
    const allTopicNames = new Set<string>();
    for (const segmentSummary of response.speakerSegmentSummaries) {
        if (segmentSummary.topicLabels) {
            segmentSummary.topicLabels.forEach(label => allTopicNames.add(label));
        }
    }

    const topics = await prisma.topic.findMany({
        where: { name: { in: Array.from(allTopicNames) }, deprecated: false }
    });
    const topicByName = new Map(topics.map(t => [t.name, t]));

    // Prepare all operations for batch execution.
    // Stale-data cleanup is PREPENDED so it runs in the SAME transaction as the
    // repopulation below: if repopulation fails, the cleanup rolls back too and the
    // meeting keeps its old data instead of being left empty. This runs on every
    // successful callback (not just force) — summaries upsert by speakerSegmentId, but
    // TopicLabels and utterance discussion statuses need explicit cleanup because old
    // rows for segments/topics no longer in the new response would otherwise persist.
    const operations: any[] = [
        prisma.topicLabel.deleteMany({
            where: { speakerSegmentId: { in: availableSpeakerSegmentIds } }
        }),
        prisma.utterance.updateMany({
            where: { speakerSegmentId: { in: availableSpeakerSegmentIds } },
            data: { discussionStatus: null, discussionSubjectId: null }
        }),
    ];

    for (const segmentSummary of response.speakerSegmentSummaries) {
        if (!availableSpeakerSegmentIds.includes(segmentSummary.speakerSegmentId)) {
            console.log(`Speaker segment ${segmentSummary.speakerSegmentId} not found`);
            continue;
        }

        // Summary upsert
        operations.push(
            prisma.summary.upsert({
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
            })
        );

        // Topic label upserts
        if (segmentSummary.topicLabels) {
            for (const topicLabel of segmentSummary.topicLabels) {
                const topic = topicByName.get(topicLabel);
                if (topic) {
                    operations.push(
                        prisma.topicLabel.upsert({
                            where: {
                                id: `${segmentSummary.speakerSegmentId}_${topic.id}`
                            },
                            update: {},
                            create: {
                                id: `${segmentSummary.speakerSegmentId}_${topic.id}`,
                                speakerSegment: { connect: { id: segmentSummary.speakerSegmentId } },
                                topic: { connect: { id: topic.id } }
                            }
                        })
                    );
                } else {
                    console.log(`Topic not found: ${topicLabel}`);
                }
            }
        }
    }

    // Execute all operations in a single transaction
    // Note: Array-based $transaction doesn't support timeout in Prisma 5
    // With batching, this should complete quickly (< 10 seconds)
    await prisma.$transaction(operations);

    // Save subjects: matches by agendaItemIndex to preserve existing IDs (avoids ES orphans)
    // The discussion tags go in with the subjects: they must commit together, or the search
    // index keeps the pre-tagging discussion metrics (elasticsearch/README.md).
    await saveSubjectsForMeeting(
        response.subjects,
        councilMeeting.cityId,
        councilMeeting.id,
        response.utteranceDiscussionStatuses
    );

    console.log(`Saved summaries and topic labels for meeting ${councilMeeting.id}`);

    // Bust the meeting/subject cache now that all summarize results are persisted,
    // BEFORE sending notifications below. The notification send is rate-limited
    // (~500ms/recipient), so revalidating only after it finishes would let early
    // recipients open the meeting and see stale, pre-summarize content.
    revalidateMeeting(councilMeeting.cityId, councilMeeting.id);

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
                    cityId: councilMeeting.cityId,
                    meetingId: councilMeeting.id,
                    cityName: councilMeeting.city.name_en,
                    meetingName: councilMeeting.name,
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
