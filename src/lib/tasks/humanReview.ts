"use server";

import prisma from '@/lib/db/prisma';
import { NotificationBehavior, TaskStatus } from '@prisma/client';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { checkTaskIdempotency, type TaskIdempotencyResult } from './tasks';
import { revalidateMeeting } from '@/lib/cache';
import { getMeetingReviewStats } from '@/lib/db/reviews';
import { sendHumanReviewCompletedAdminAlert } from '@/lib/discord';
import { sendTranscriptToMunicipality } from './sendTranscript';
import { requestSummarize } from './summarize';
import { autoTriggerTask, type AutoTriggerOutcome } from './autoTrigger';

/**
 * Whether the summarize task can start for a meeting.
 * The pipeline runs summarize after human review, so an existing summarize
 * task blocks a second run — see checkTaskIdempotency.
 */
export type SummarizeAvailability = 'available' | 'running' | 'succeeded';

/**
 * One i18n key per blocked reason. A new reason in checkTaskIdempotency fails to
 * compile here, so it can never fall through to 'available' and present the
 * reviewer an enabled checkbox that then fails at submit time.
 */
const SUMMARIZE_AVAILABILITY: Record<
    NonNullable<TaskIdempotencyResult['blockedReason']>,
    SummarizeAvailability
> = {
    already_succeeded: 'succeeded',
    already_running: 'running',
};

export interface ReviewCompletionState {
    /** Contact emails of the administrative body. Empty when the body configures none. */
    contactEmails: string[];
    administrativeBodyName: string | null;
    /** Notification behavior of the administrative body. null when the meeting has no body. */
    notificationBehavior: NotificationBehavior | null;
    summarizeAvailability: SummarizeAvailability;
    /** Whether the meeting is public. Notifications link to a page that only edit users can open when it is false. */
    released: boolean;
}

/**
 * What each follow-up did. 'notRequested' keeps the reviewer's choice in the result,
 * so a caller can tell "the reviewer declined it" from "it did not run".
 */
export interface ReviewFollowUpOutcomes {
    summarize: AutoTriggerOutcome | 'notRequested';
    transcript: 'sent' | 'skipped' | 'failed' | 'notRequested';
}

export interface MarkHumanReviewCompleteResult {
    review: TaskStatus;
    followUps: ReviewFollowUpOutcomes;
}

export interface MarkHumanReviewCompleteOptions {
    /** Manual time estimate from the reviewer, for when the calculated time is inaccurate. */
    manualReviewTime?: string;
    /** Send the transcript email to the municipality. Default false — callers must opt in. */
    sendTranscript?: boolean;
    /** Start the summarize task for the reviewed transcript. Default false — callers must opt in. */
    runSummarize?: boolean;
}

/**
 * Get the state that the reviewer confirms when the review completes:
 * the transcript recipients, the notification behavior of the administrative
 * body, and whether summarize can still run for the meeting.
 */
export async function getReviewCompletionState(cityId: string, meetingId: string): Promise<ReviewCompletionState> {
    await withUserAuthorizedToEdit({ councilMeetingId: meetingId, cityId });

    const [meeting, summarizeIdempotency] = await Promise.all([
        prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id: meetingId } },
            select: {
                released: true,
                administrativeBody: {
                    select: {
                        contactEmails: true,
                        name: true,
                        notificationBehavior: true,
                    }
                }
            }
        }),
        checkTaskIdempotency('summarize', cityId, meetingId),
    ]);

    // markHumanReviewComplete throws for the same meeting, so the dialog must not
    // render normally here and then fail at confirm time
    if (!meeting) {
        throw new Error(`Council meeting ${cityId}/${meetingId} not found`);
    }

    const blockedReason = summarizeIdempotency.blockedReason;

    return {
        contactEmails: meeting.administrativeBody?.contactEmails || [],
        administrativeBodyName: meeting.administrativeBody?.name || null,
        notificationBehavior: meeting.administrativeBody?.notificationBehavior || null,
        summarizeAvailability: blockedReason ? SUMMARIZE_AVAILABILITY[blockedReason] : 'available',
        released: meeting.released,
    };
}

/**
 * Mark human review as complete for a meeting
 * This creates a virtual task that represents human review completion
 *
 * The review record is written once. The follow-up actions run on every call,
 * because the record commits before them: a timeout or a failure between the two
 * would otherwise strand the meeting with a complete review and no follow-up,
 * and a retry would return the existing record without running anything.
 */
export async function markHumanReviewComplete(
    cityId: string,
    meetingId: string,
    { manualReviewTime, sendTranscript = false, runSummarize = false }: MarkHumanReviewCompleteOptions = {}
): Promise<MarkHumanReviewCompleteResult> {
    await withUserAuthorizedToEdit({ councilMeetingId: meetingId, cityId });

    const idempotency = await checkTaskIdempotency('humanReview', cityId, meetingId);
    const existingReview = idempotency.proceed ? null : idempotency.existingTask;

    // Get meeting details for the Discord alert and the follow-up task context
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        include: {
            city: true
        }
    });

    if (!meeting) {
        throw new Error(`Council meeting ${cityId}/${meetingId} not found`);
    }

    const created = existingReview ?? await createHumanReviewRecord(cityId, meetingId, meeting, manualReviewTime);

    const followUps = await runReviewFollowUps(cityId, meetingId, meeting, created.id, { sendTranscript, runSummarize });

    // After the follow-ups, so the task list of the meeting includes the tasks they
    // started. A revalidation before them repopulates the cache without those tasks,
    // and no later event corrects it until the backend reports a result.
    revalidateMeeting(cityId, meetingId);

    return { review: created, followUps };
}

/**
 * Write the virtual task that records the completed review, then report the
 * review stats to the admins.
 */
async function createHumanReviewRecord(
    cityId: string,
    meetingId: string,
    meeting: { name: string; city: { name_en: string } },
    manualReviewTime?: string
) {
    // Get actual reviewer stats from the meeting's edit history
    // This identifies the primary reviewer (most edits) regardless of who clicks "complete"
    const stats = await getMeetingReviewStats({ cityId, meetingId });

    const created = await prisma.taskStatus.create({
        data: {
            type: 'humanReview',
            status: 'succeeded',
            requestBody: JSON.stringify({
                triggeredBy: 'user',
                ...(manualReviewTime && { manualReviewTime })
            }),
            councilMeeting: { connect: { cityId_id: { cityId, id: meetingId } } }
        }
    });

    // Send Discord admin alert with review stats
    // Show primary reviewer and list any secondary reviewers for context
    if (stats.hasReviewers && stats.primaryReviewer && meeting) {
        // Extract session data from unified review sessions
        const sessionDurations = stats.unifiedReviewSessions?.map(s => s.durationMs) || [];
        const sessionReviewerIds = stats.unifiedReviewSessions?.map(s => s.reviewerId) || [];
        
        // Calculate total review time from all sessions (all reviewers)
        const totalReviewTimeMs = sessionDurations.reduce((sum, duration) => sum + duration, 0);
        
        // Calculate efficiency based on total time from all reviewers
        const totalReviewEfficiency = stats.meetingDurationMs > 0 && totalReviewTimeMs > 0
            ? totalReviewTimeMs / stats.meetingDurationMs
            : stats.reviewEfficiency;
        
        sendHumanReviewCompletedAdminAlert({
            cityId,
            cityName: meeting.city.name_en,
            meetingId,
            meetingName: meeting.name,
            primaryReviewer: stats.primaryReviewer,
            secondaryReviewers: stats.secondaryReviewers,
            editCount: stats.editCount,
            totalUtterances: stats.totalUtterances,
            estimatedReviewTimeMs: stats.estimatedReviewTimeMs,
            totalReviewTimeMs,
            sessionDurations,
            sessionReviewerIds,
            meetingDurationMs: stats.meetingDurationMs,
            reviewEfficiency: totalReviewEfficiency,
            manualReviewTime,
        });
    }

    return created;
}

/**
 * Run the actions that the reviewer opted in to, and report what each one did.
 * Neither action throws, so the two run together: the transcript email renders a
 * DOCX, and summarize reads the transcript again, so a sequential run doubles the
 * wait of the reviewer.
 */
async function runReviewFollowUps(
    cityId: string,
    meetingId: string,
    meeting: { name_en: string; city: { name_en: string } },
    reviewTaskId: string,
    { sendTranscript, runSummarize }: Required<Omit<MarkHumanReviewCompleteOptions, 'manualReviewTime'>>
): Promise<ReviewFollowUpOutcomes> {
    const [summarize, transcript] = await Promise.all([
        // Auto-chain the next pipeline step: the reviewed transcript is ready to summarize
        runSummarize
            ? autoTriggerTask(
                'summarize',
                {
                    cityId,
                    meetingId,
                    cityName: meeting.city.name_en,
                    meetingName: meeting.name_en,
                    source: { taskType: 'humanReview', taskId: reviewTaskId },
                },
                () => requestSummarize(cityId, meetingId)
            )
            : Promise.resolve('notRequested' as const),
        sendTranscript
            ? sendReviewedTranscript(cityId, meetingId)
            : Promise.resolve('notRequested' as const),
    ]);

    return { summarize, transcript };
}

/**
 * Send the transcript to the municipality and report the outcome.
 * sendTranscriptToMunicipality reports a failure in its result and never throws,
 * so an unreported failure would leave the reviewer with a success message.
 */
async function sendReviewedTranscript(
    cityId: string,
    meetingId: string
): Promise<ReviewFollowUpOutcomes['transcript']> {
    const result = await sendTranscriptToMunicipality(cityId, meetingId);

    if (result.skipped) {
        console.log(`[humanReview] Transcript sending skipped (no contact emails) for ${cityId}/${meetingId}`);
        return 'skipped';
    }

    if (!result.success) {
        console.error(`[humanReview] Transcript sending failed for ${cityId}/${meetingId}: ${result.error}`);
        return 'failed';
    }

    console.log(`[humanReview] Transcript sent to ${result.recipientEmails?.join(', ')} for ${cityId}/${meetingId}`);
    return 'sent';
}
