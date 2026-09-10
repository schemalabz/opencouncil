/**
 * Discord Admin Alerts Integration
 *
 * Alerts about a specific council meeting. Reads the database to resolve the
 * city's realm; the runtime-agnostic primitives live in `discord-core.ts`.
 */

import type { Realm } from '@prisma/client';
import { env } from '@/env.mjs';
import { formatDate, formatDateTime, formatWeekday } from '@/lib/formatters/time';
import { formatDurationMs } from '@/lib/formatters/time';
import { getCityRealm } from '@/lib/db/cityRealm';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import { sendAdminAlert, truncateField } from '@/lib/discord-core';
import type { ReviewerInfo } from '@/lib/db/reviews';
import type { PollDecisionsMeetingResult } from '@/lib/tasks/pollDecisions';

/** Satisfied structurally by every alert payload, so no call site builds one. */
type MeetingRef = { cityId: string; meetingId: string };

/** The page under a meeting that an alert links to. */
type MeetingPath = '' | '/admin' | '/decisions';

/**
 * The realm to build a city's links on, or null when it cannot be resolved.
 *
 * Never rejects: most alert callers fire and forget without a `.catch()`, so a
 * rejection here would turn a Discord message into a crash.
 */
async function cityRealm(cityId: string): Promise<Realm | null> {
    return getCityRealm(cityId).catch((error) => {
        console.error(`Failed to resolve the realm of ${cityId} for a Discord alert link:`, error);
        return null;
    });
}

/**
 * Absolute URL of a meeting page, on the domain of the realm that owns the city.
 *
 * Resolved here rather than threaded through ~20 alert call sites, where one
 * omission would silently produce a dead link.
 */
async function meetingUrl(ref: MeetingRef, path: MeetingPath = ''): Promise<string> {
    return `${realmBaseUrl(await cityRealm(ref.cityId))}/${ref.cityId}/${ref.meetingId}${path}`;
}

/**
 * Send admin alert when a new council meeting is added
 */
export async function sendMeetingCreatedAdminAlert(data: {
    cityName: string;
    meetingName: string;
    meetingDate: Date;
    meetingId: string;
    cityId: string;
}): Promise<void> {
    const meetingPageUrl = await meetingUrl(data);

    await sendAdminAlert({
        title: `🆕 ${data.cityId}: ${data.meetingId}`,
        description: `Scheduled for ${formatWeekday(data.meetingDate)}, ${formatDateTime(data.meetingDate)}`,
        color: 0x00ff00, // Green
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Meeting',
                value: data.meetingName,
                inline: true,
            },
            {
                name: 'Date',
                value: formatDate(data.meetingDate, undefined, 'en'),
                inline: false,
            },
            {
                name: 'View Meeting',
                value: `[Open in OpenCouncil](${meetingPageUrl})`,
                inline: false,
            },
        ],
    });
}

const TASK_STATUS_CONFIG = {
    started: { emoji: '▶️', color: 0x0099ff, prefix: 'Processing' },
    completed: { emoji: '✅', color: 0x00ff00, prefix: 'Completed' },
    failed: { emoji: '❌', color: 0xff0000, prefix: 'Failed' },
} as const;

/**
 * Send admin alert for task lifecycle events (started, completed, failed)
 */
export async function sendTaskAdminAlert(data: {
    status: 'started' | 'completed' | 'failed';
    taskType: string;
    cityName: string;
    meetingName: string;
    taskId: string;
    cityId: string;
    meetingId: string;
    error?: string;
}): Promise<void> {
    const config = TASK_STATUS_CONFIG[data.status];

    const meetingAdminUrl = await meetingUrl(data, '/admin');

    await sendAdminAlert({
        title: `${config.emoji} ${data.taskType} - ${data.cityId}`,
        description: `${config.prefix}: ${data.meetingId}`,
        color: config.color,
        fields: [
            {
                name: 'Task Type',
                value: data.taskType,
                inline: true,
            },
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Meeting',
                value: data.meetingName,
                inline: false,
            },
            {
                name: 'Task ID',
                value: `\`${data.taskId}\``,
                inline: false,
            },
            ...(data.error ? [{
                name: 'Error',
                value: data.error.substring(0, 1024), // Discord field value limit
                inline: false,
            }] : []),
            {
                name: 'Admin Panel',
                value: `[Open Meeting Admin](${meetingAdminUrl})`,
                inline: false,
            },
        ],
    });
}

/**
 * Send admin alert when a user completes onboarding
 */
export async function sendUserOnboardedAdminAlert(data: {
    cityId?: string;
    cityName: string;
    onboardingSource: 'notification_preferences' | 'petition' | 'admin_invite' | 'magic_link';
}): Promise<void> {
    const sourceLabels = {
        notification_preferences: 'Notification Preferences',
        petition: 'Petition',
        admin_invite: 'Admin Invite',
        magic_link: 'Magic Link',
    };

    const title = data.cityId
        ? `✨ User Onboarded - ${data.cityId}`
        : '✨ User Onboarded';

    await sendAdminAlert({
        title,
        description: `A user has completed onboarding.`,
        color: 0x9b59b6, // Purple
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Onboarding Source',
                value: sourceLabels[data.onboardingSource],
                inline: true,
            },
        ],
        footer: {
            text: 'PII not transmitted for privacy',
        },
    });
}

/**
 * Send admin alert when a petition is received
 */
export async function sendPetitionReceivedAdminAlert(data: {
    cityId: string;
    cityName: string;
    isResident: boolean;
    isCitizen: boolean;
}): Promise<void> {
    await sendAdminAlert({
        title: `📝 New Petition Received - ${data.cityId}`,
        description: `A petition has been submitted for a municipality.`,
        color: 0xf39c12, // Orange
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Resident',
                value: data.isResident ? '✓ Yes' : '✗ No',
                inline: true,
            },
            {
                name: 'Citizen',
                value: data.isCitizen ? '✓ Yes' : '✗ No',
                inline: true,
            },
        ],
        footer: {
            text: 'PII not transmitted for privacy',
        },
    });
}

/**
 * Send admin alert when someone signs up for notifications
 */
export async function sendNotificationSignupAdminAlert(data: {
    cityId: string;
    cityName: string;
    locationCount: number;
    topicCount: number;
}): Promise<void> {
    await sendAdminAlert({
        title: `🔔 New Notification Signup - ${data.cityId}`,
        description: `A user has signed up for notifications.`,
        color: 0x3498db, // Light blue
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Locations',
                value: data.locationCount.toString(),
                inline: true,
            },
            {
                name: 'Topics',
                value: data.topicCount.toString(),
                inline: true,
            },
        ],
        footer: {
            text: 'PII not transmitted for privacy',
        },
    });
}

/**
 * Send admin alert when notifications are created for a meeting
 */
export async function sendNotificationsCreatedAdminAlert(data: {
    cityName: string;
    meetingName: string;
    notificationType: string;
    notificationsCreated: number;
    subjectsTotal: number;
    cityId: string;
    meetingId: string;
    autoSend: boolean;
}): Promise<void> {
    const adminNotificationsUrl = `${env.NEXTAUTH_URL}/admin/notifications`;

    const meetingPageUrl = await meetingUrl(data);

    await sendAdminAlert({
        title: `📬 Notifications Created - ${data.cityId}`,
        description: `${data.notificationsCreated} ${data.notificationType} notifications created for ${data.meetingId}`,
        color: 0x9b59b6, // Purple
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Type',
                value: data.notificationType === 'beforeMeeting' ? 'Before Meeting' : 'After Meeting',
                inline: true,
            },
            {
                name: 'Meeting',
                value: data.meetingName,
                inline: false,
            },
            {
                name: 'Users Notified',
                value: data.notificationsCreated.toString(),
                inline: true,
            },
            {
                name: 'Total Subjects',
                value: data.subjectsTotal.toString(),
                inline: true,
            },
            {
                name: 'Status',
                value: data.autoSend ? '✅ Sent Immediately' : '⏸️ Pending Approval',
                inline: false,
            },
            {
                name: 'Links',
                value: `[View Meeting](${meetingPageUrl}) | [Manage Notifications](${adminNotificationsUrl})`,
                inline: false,
            },
        ],
    });
}

/**
 * Send admin alert when notifications are sent/released
 */
export async function sendNotificationsSentAdminAlert(data: {
    cityId: string;
    meetingId: string;
    cityName: string;
    meetingName: string;
    notificationCount: number;
    emailsSent: number;
    messagesSent: number;
    failed: number;
}): Promise<void> {
    // Only send if we actually sent some notifications
    if (data.emailsSent === 0 && data.messagesSent === 0 && data.failed === 0) {
        return;
    }

    const adminNotificationsUrl = `${env.NEXTAUTH_URL}/admin/notifications`;
    const color = data.failed > 0 ? 0xe74c3c : 0x2ecc71; // Red if failures, green if all success

    const meetingPageUrl = await meetingUrl(data);

    await sendAdminAlert({
        title: `📤 Notifications Sent - ${data.cityId}`,
        description: `Delivery batch completed for ${data.notificationCount} notifications for ${data.meetingId}`,
        color,
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Meeting',
                value: data.meetingName,
                inline: true,
            },
            {
                name: '📧 Emails Sent',
                value: data.emailsSent.toString(),
                inline: true,
            },
            {
                name: '💬 Messages Sent',
                value: data.messagesSent.toString(),
                inline: true,
            },
            {
                name: '❌ Failed',
                value: data.failed.toString(),
                inline: true,
            },
            {
                name: 'Links',
                value: `[View Meeting](${meetingPageUrl}) | [Manage Notifications](${adminNotificationsUrl})`,
                inline: false,
            },
        ],
    });
}

/**
 * Send admin alert when a human review is completed
 */
export async function sendHumanReviewCompletedAdminAlert(data: {
    cityId: string;
    cityName: string;
    meetingId: string;
    meetingName: string;
    primaryReviewer: ReviewerInfo;
    secondaryReviewers: ReviewerInfo[];
    editCount: number;
    totalUtterances: number;
    estimatedReviewTimeMs: number;
    totalReviewTimeMs: number; // Total time from all reviewers
    sessionDurations: number[]; // Array of session durations in milliseconds
    sessionReviewerIds: string[]; // Array of reviewer IDs for each session (to mark primary vs secondary)
    meetingDurationMs: number;
    reviewEfficiency: number;
    manualReviewTime?: string;
}): Promise<void> {
    const adminReviewsUrl = `${env.NEXTAUTH_URL}/admin/reviews`;
    const meetingPageUrl = await meetingUrl(data);

    const primaryReviewTime = formatDurationMs(data.estimatedReviewTimeMs);
    const totalReviewTime = formatDurationMs(data.totalReviewTimeMs);
    const meetingDuration = formatDurationMs(data.meetingDurationMs);
    const efficiency = `1:${data.reviewEfficiency.toFixed(1)}`;
    
    // Format sessions with durations, marking secondary reviewers with ↳
    const sessionDurationsFormatted = data.sessionDurations
        .map((ms, index) => {
            const duration = formatDurationMs(ms);
            const isSecondary = data.sessionReviewerIds[index] !== data.primaryReviewer.userId;
            return isSecondary ? `↳${duration}` : duration;
        })
        .join(' + ');
    const sessionsDisplay = `${data.sessionDurations.length} (${sessionDurationsFormatted})`;
    
    // If manual time provided, format it for display
    const reviewTimeDisplay = data.manualReviewTime 
        ? `${primaryReviewTime} (Reviewer estimate: ${data.manualReviewTime})`
        : primaryReviewTime;

    // Format primary reviewer
    const primaryReviewerName = data.primaryReviewer.userName || data.primaryReviewer.userEmail;
    
    // Format secondary reviewers if any
    const secondaryReviewersText = data.secondaryReviewers.length > 0
        ? data.secondaryReviewers
            .map(r => `${r.userName || r.userEmail} (${r.editCount} edits)`)
            .join(', ')
        : 'None';

    const fields: Array<{
        name: string;
        value: string;
        inline?: boolean;
    }> = [
        {
            name: 'Municipality',
            value: data.cityName,
            inline: true,
        },
        {
            name: 'Meeting',
            value: data.meetingName,
            inline: true,
        },
        {
            name: '👤 Primary Reviewer',
            value: `${primaryReviewerName} (${data.editCount} / ${data.totalUtterances} utterances edited)`,
            inline: false,
        },
    ];

    // Add secondary reviewers field if there are any
    if (data.secondaryReviewers.length > 0) {
        fields.push({
            name: '👥 Additional Reviewers',
            value: secondaryReviewersText,
            inline: false,
        });
    }

    // Add time fields
    fields.push({
        name: '⏱️ Review Time (Primary)',
        value: reviewTimeDisplay,
        inline: true,
    });
    
    // Add total time field only if there are secondary reviewers
    if (data.secondaryReviewers.length > 0) {
        fields.push({
            name: '⏱️ Total Time (All)',
            value: totalReviewTime,
            inline: true,
        });
    }
    
    fields.push(
        {
            name: '🎬 Sessions',
            value: sessionsDisplay,
            inline: false,
        },
        {
            name: '⚡ Efficiency',
            value: efficiency,
            inline: true,
        },
        {
            name: '📊 Meeting Duration',
            value: meetingDuration,
            inline: true,
        },
        {
            name: 'View Meeting',
            value: `[Open Meeting](${meetingPageUrl})`,
            inline: true,
        },
        {
            name: 'All Reviews',
            value: `[View All Reviews](${adminReviewsUrl})`,
            inline: false,
        }
    );

    await sendAdminAlert({
        title: `✅ Human Review Completed - ${data.cityId}`,
        description: `${data.meetingId}`,
        color: 0x2ecc71, // Green
        fields,
    });
}

/**
 * Send admin alert when a transcript is successfully sent to a municipality
 */
export async function sendTranscriptSentAdminAlert(data: {
    cityId: string;
    cityName: string;
    meetingId: string;
    meetingName: string;
    recipientEmails: string[];
    administrativeBodyName: string;
}): Promise<void> {
    const meetingPageUrl = await meetingUrl(data);

    await sendAdminAlert({
        title: `📧 Transcript Sent - ${data.cityId}`,
        description: `Transcript email sent for ${data.meetingId}`,
        color: 0x2ecc71, // Green
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Administrative Body',
                value: data.administrativeBodyName,
                inline: true,
            },
            {
                name: 'Meeting',
                value: data.meetingName,
                inline: false,
            },
            {
                name: data.recipientEmails.length > 1 ? 'Recipients' : 'Recipient',
                value: data.recipientEmails.join(', '),
                inline: false,
            },
            {
                name: 'View Meeting',
                value: `[Open in OpenCouncil](${meetingPageUrl})`,
                inline: false,
            },
        ],
    });
}

/**
 * Send batch started alert when the pollDecisions cron dispatches tasks.
 * Replaces individual "started" alerts for cron-triggered polls.
 */
export async function sendPollDecisionsBatchStartedAlert(data: {
    dispatchedCount: number;
    skippedCount: number;
    meetings: Array<{ cityId: string; meetingId: string }>;
    errors: Array<{ cityId: string; meetingId: string; error: string }>;
}): Promise<void> {
    if (data.dispatchedCount === 0 && data.errors.length === 0) return;

    const meetingList = data.meetings
        .map(m => `\`${m.cityId}/${m.meetingId}\``)
        .join('\n');

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: 'Dispatched', value: data.dispatchedCount.toString(), inline: true },
        { name: 'Skipped (backoff)', value: data.skippedCount.toString(), inline: true },
    ];

    if (meetingList) {
        fields.push({
            name: 'Meetings',
            value: truncateField(meetingList),
            inline: false,
        });
    }

    if (data.errors.length > 0) {
        const errorText = data.errors
            .map(e => `\`${e.cityId}/${e.meetingId}\`: ${e.error}`)
            .join('\n');
        fields.push({
            name: 'Dispatch Errors',
            value: truncateField(errorText),
            inline: false,
        });
    }

    await sendAdminAlert({
        title: `▶️ pollDecisions cron: ${data.dispatchedCount} tasks dispatched`,
        description: data.errors.length > 0
            ? `${data.errors.length} dispatch error(s)`
            : 'Batch dispatched successfully',
        color: 0x3498db, // Blue
        fields,
    });
}

/**
 * Send batch completed alert when all pollDecisions tasks in a cron batch finish.
 * Aggregates results from all sibling tasks into a single summary.
 */
export async function sendPollDecisionsBatchCompletedAlert(data: {
    succeededCount: number;
    failedCount: number;
    totalMatches: number;
    totalReassignments: number;
    totalConflicts: number;
    totalExtractions: number;
    totalUnplaced: number;
    totalSuggested: number;
    totalUnmatchedSubjects: number;
    totalReadIssues: number;
    meetingBreakdown: PollDecisionsMeetingResult[];
}): Promise<void> {
    const hasFailures = data.failedCount > 0;
    // Check per-meeting breakdown for any conflicts
    const hasConflicts = data.meetingBreakdown.some(m => m.conflicts > 0);

    const color = hasFailures ? 0xff0000 : hasConflicts ? 0xf39c12 : 0x00ff00;

    // Human work left behind by this batch: candidates without a subject,
    // subjects without a decision, and ADA collisions.
    const needsReview = data.totalUnplaced + data.totalUnmatchedSubjects + data.totalConflicts;

    const parts: string[] = [];
    if (data.totalMatches > 0) parts.push(`${data.totalMatches} linked`);
    if (needsReview > 0) parts.push(`${needsReview} to review`);
    if (hasFailures) parts.push(`${data.failedCount} failure(s)`);
    const title = parts.length > 0
        ? `📋 pollDecisions: ${parts.join(' · ')}`
        : '📋 pollDecisions batch completed (no new links, nothing to review)';

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: 'Succeeded', value: data.succeededCount.toString(), inline: true },
        { name: 'Failed', value: data.failedCount.toString(), inline: true },
        { name: 'Linked', value: data.totalMatches.toString(), inline: true },
    ];

    if (data.totalUnplaced > 0) {
        const suggestedNote = data.totalSuggested > 0 ? ` (${data.totalSuggested} suggested)` : '';
        fields.push({ name: 'Unplaced candidates', value: `${data.totalUnplaced}${suggestedNote}`, inline: true });
    }

    if (data.totalUnmatchedSubjects > 0) {
        fields.push({ name: 'Unmatched subjects', value: data.totalUnmatchedSubjects.toString(), inline: true });
    }

    if (data.totalConflicts > 0) {
        fields.push({ name: 'Conflicts', value: data.totalConflicts.toString(), inline: true });
    }

    if (data.totalReassignments > 0) {
        fields.push({ name: 'Reassignments', value: data.totalReassignments.toString(), inline: true });
    }

    if (data.totalExtractions > 0) {
        fields.push({ name: 'Extracted', value: data.totalExtractions.toString(), inline: true });
    }

    if (data.totalReadIssues > 0) {
        fields.push({ name: 'Read issues', value: `${data.totalReadIssues} (unreadable / no meeting date)`, inline: true });
    }

    // Per-meeting breakdown for meetings with results or failures
    const notable = data.meetingBreakdown.filter(
        m => m.matches > 0 || m.reassignments > 0 || m.conflicts > 0 || m.extractions > 0
            || m.unplaced > 0 || m.unmatchedSubjects > 0 || m.readIssues > 0 || m.status === 'failed'
    );

    if (notable.length > 0) {
        const breakdown = notable
            .map(m => {
                const parts: string[] = [`\`${m.cityId}/${m.meetingId}\``];
                if (m.status === 'failed') {
                    parts.push(`**FAILED**: ${m.error?.substring(0, 200) ?? 'unknown error'}`);
                } else {
                    const details: string[] = [];
                    if (m.matches > 0) details.push(`${m.matches} linked`);
                    if (m.unplaced > 0) details.push(m.suggested > 0 ? `${m.unplaced} unplaced (${m.suggested} suggested)` : `${m.unplaced} unplaced`);
                    if (m.unmatchedSubjects > 0) details.push(`${m.unmatchedSubjects} unmatched subject(s)`);
                    if (m.conflicts > 0) details.push(`${m.conflicts} conflict(s)`);
                    if (m.reassignments > 0) details.push(`${m.reassignments} reassignment(s)`);
                    if (m.extractions > 0) details.push(`${m.extractions} extracted`);
                    if (m.readIssues > 0) details.push(`${m.readIssues} read issue(s)`);
                    parts.push(details.join(', '));
                }
                return parts.join(' — ');
            })
            .join('\n');
        fields.push({
            name: 'Details',
            value: truncateField(breakdown),
            inline: false,
        });
    }

    // Review links: decisions work lives on the meeting decisions page since
    // the DecisionsPanel dialog was retired; failures still point at the admin
    // page, where task errors are handled.
    const actionable = data.meetingBreakdown.filter(m => m.matches > 0 || m.conflicts > 0 || m.unplaced > 0 || m.unmatchedSubjects > 0 || m.status === 'failed');
    if (actionable.length > 0) {
        // Prisma batches same-tick findUnique calls by query shape, so these
        // resolve in one round trip without a hand-rolled per-city cache.
        const links = (await Promise.all(actionable.map(async m => {
            const url = await meetingUrl(m, m.status === 'failed' ? '/admin' : '/decisions');
            return `[${m.cityId}/${m.meetingId}](${url})`;
        }))).join(' | ');
        fields.push({
            name: 'Review',
            value: truncateField(links),
            inline: false,
        });
    }

    await sendAdminAlert({
        title,
        description: `${data.succeededCount + data.failedCount} task(s) completed`,
        color,
        fields,
    });
}

/**
 * Send admin alert when transcript sending fails
 */
export async function sendTranscriptSendFailedAdminAlert(data: {
    cityId: string;
    meetingId: string;
    error: string;
}): Promise<void> {
    const meetingPageUrl = await meetingUrl(data);

    await sendAdminAlert({
        title: `❌ Transcript Send Failed - ${data.cityId}`,
        description: `Failed to send transcript for ${data.meetingId}`,
        color: 0xff0000, // Red
        fields: [
            {
                name: 'Meeting',
                value: `${data.cityId}/${data.meetingId}`,
                inline: false,
            },
            {
                name: 'Error',
                value: data.error.substring(0, 1024), // Discord field value limit
                inline: false,
            },
            {
                name: 'View Meeting',
                value: `[Open in OpenCouncil](${meetingPageUrl})`,
                inline: false,
            },
        ],
    });
}

/**
 * Send admin alert when the poll-livestreams cron auto-matched a meeting to a
 * YouTube video and triggered transcription. Lets a human sanity-check the match.
 */
export async function sendLivestreamMatchedAlert(data: {
    cityId: string;
    cityName: string;
    meetingId: string;
    meetingName: string;
    videoUrl: string;
    videoTitle: string;
    confidence: number;
    reasoning: string;
}): Promise<void> {
    const meetingAdminUrl = await meetingUrl(data, '/admin');

    await sendAdminAlert({
        title: `🎥 Livestream auto-matched - ${data.cityId}`,
        description: `Transcription triggered for ${data.meetingId}`,
        color: 0x2ecc71, // Green
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Confidence',
                value: data.confidence.toFixed(2),
                inline: true,
            },
            {
                name: 'Meeting',
                value: data.meetingName,
                inline: false,
            },
            {
                name: 'Matched Video',
                value: `[${truncateField(data.videoTitle, 256)}](${data.videoUrl})`,
                inline: false,
            },
            {
                name: 'Reasoning',
                value: truncateField(data.reasoning),
                inline: false,
            },
            {
                name: 'Admin Panel',
                value: `[Open Meeting Admin](${meetingAdminUrl})`,
                inline: false,
            },
        ],
    });
}

/**
 * Send admin alert when the poll-livestreams cron found a video that appears to
 * cover MORE THAN ONE council meeting (e.g. a combined λογοδοσία + τακτική stream).
 * These are handled manually — fired once per meeting (dedup via Valkey at the call site).
 */
export async function sendLivestreamMultipleMeetingsAlert(data: {
    cityId: string;
    cityName: string;
    meetingId: string;
    meetingName: string;
    channelUrl: string;
    videoUrl?: string;
    reasoning: string;
}): Promise<void> {
    const meetingAdminUrl = await meetingUrl(data, '/admin');

    await sendAdminAlert({
        title: `⚠️ Livestream needs manual handling - ${data.cityId}`,
        description: `A candidate video appears to cover multiple meetings for ${data.meetingId}`,
        color: 0xf39c12, // Yellow/orange
        fields: [
            {
                name: 'Municipality',
                value: data.cityName,
                inline: true,
            },
            {
                name: 'Meeting',
                value: data.meetingName,
                inline: false,
            },
            ...(data.videoUrl ? [{
                name: 'Candidate Video',
                value: data.videoUrl,
                inline: false,
            }] : []),
            {
                name: 'Channel',
                value: data.channelUrl,
                inline: false,
            },
            {
                name: 'Reasoning',
                value: truncateField(data.reasoning),
                inline: false,
            },
            {
                name: 'Admin Panel',
                value: `[Open Meeting Admin](${meetingAdminUrl})`,
                inline: false,
            },
        ],
    });
}
