/**
 * Discord Admin Alerts Integration
 * 
 * This module provides utilities to send admin alerts to a Discord channel
 * via webhook for important system events.
 */

import { env } from '@/env.mjs';
import { formatDurationMs } from '@/lib/formatters/time';
import type { ReviewerInfo } from '@/lib/db/reviews';

interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{
        name: string;
        value: string;
        inline?: boolean;
    }>;
    timestamp?: string;
    footer?: {
        text: string;
    };
}

interface DiscordWebhookPayload {
    content?: string;
    embeds?: DiscordEmbed[];
}

/**
 * Send a message to Discord via webhook
 */
async function sendDiscordMessage(payload: DiscordWebhookPayload): Promise<void> {
    // Skip if webhook URL is not configured
    if (!env.DISCORD_WEBHOOK_URL) {
        console.log('Discord webhook URL not configured, skipping admin alert');
        return;
    }

    try {
        const response = await fetch(env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error('Failed to send Discord admin alert:', response.statusText);
        }
    } catch (error) {
        console.error('Error sending Discord admin alert:', error);
    }
}

/**
 * Thin wrapper around sendDiscordMessage that adds the embed boilerplate.
 */
async function sendAdminAlert(embed: {
    title: string;
    description: string;
    color: number;
    fields: DiscordEmbed['fields'];
    footer?: DiscordEmbed['footer'];
}): Promise<void> {
    await sendDiscordMessage({
        embeds: [{
            ...embed,
            timestamp: new Date().toISOString(),
        }],
    });
}

function meetingUrl(cityId: string, meetingId: string): string {
    return `${env.NEXTAUTH_URL}/${cityId}/${meetingId}`;
}

function meetingAdminUrl(cityId: string, meetingId: string): string {
    return `${env.NEXTAUTH_URL}/${cityId}/${meetingId}/admin`;
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
    await sendAdminAlert({
        title: `🆕 ${data.cityId}: ${data.meetingId}`,
        description: `Scheduled for ${data.meetingDate.toLocaleDateString('el-GR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit'
        })}`,
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
                value: data.meetingDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                }),
                inline: false,
            },
            {
                name: 'View Meeting',
                value: `[Open in OpenCouncil](${meetingUrl(data.cityId, data.meetingId)})`,
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
                value: `[Open Meeting Admin](${meetingAdminUrl(data.cityId, data.meetingId)})`,
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
                value: `[View Meeting](${meetingUrl(data.cityId, data.meetingId)}) | [Manage Notifications](${adminNotificationsUrl})`,
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
                value: `[View Meeting](${meetingUrl(data.cityId, data.meetingId)}) | [Manage Notifications](${adminNotificationsUrl})`,
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
            value: `[Open Meeting](${meetingUrl(data.cityId, data.meetingId)})`,
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
                value: `[Open in OpenCouncil](${meetingUrl(data.cityId, data.meetingId)})`,
                inline: false,
            },
        ],
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
                value: `[Open in OpenCouncil](${meetingUrl(data.cityId, data.meetingId)})`,
                inline: false,
            },
        ],
    });
}
