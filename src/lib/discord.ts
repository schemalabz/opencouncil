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
 * Send admin alert when a new council meeting is added
 */
export async function sendMeetingCreatedAdminAlert(data: {
    cityName: string;
    meetingName: string;
    meetingDate: Date;
    meetingId: string;
    cityId: string;
}): Promise<void> {
    const meetingUrl = `${env.NEXT_PUBLIC_BASE_URL}/${data.cityId}/${data.meetingId}`;

    await sendDiscordMessage({
        embeds: [{
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
                    value: `[Open in OpenCouncil](${meetingUrl})`,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        }],
    });
}

/**
 * Send admin alert when a task starts
 */
export async function sendTaskStartedAdminAlert(data: {
    taskType: string;
    cityName: string;
    meetingName: string;
    taskId: string;
    cityId: string;
    meetingId: string;
}): Promise<void> {
    const adminUrl = `${env.NEXT_PUBLIC_BASE_URL}/${data.cityId}/${data.meetingId}/admin`;

    await sendDiscordMessage({
        embeds: [{
            title: `▶️ ${data.taskType} - ${data.cityId}`,
            description: `Processing: ${data.meetingId}`,
            color: 0x0099ff, // Blue
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
                {
                    name: 'Admin Panel',
                    value: `[Open Meeting Admin](${adminUrl})`,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        }],
    });
}

/**
 * Send admin alert when a task completes successfully
 */
export async function sendTaskCompletedAdminAlert(data: {
    taskType: string;
    cityName: string;
    meetingName: string;
    taskId: string;
    cityId: string;
    meetingId: string;
}): Promise<void> {
    const adminUrl = `${env.NEXT_PUBLIC_BASE_URL}/${data.cityId}/${data.meetingId}/admin`;

    await sendDiscordMessage({
        embeds: [{
            title: `✅ ${data.taskType} - ${data.cityId}`,
            description: `Completed: ${data.meetingId}`,
            color: 0x00ff00, // Green
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
                {
                    name: 'Admin Panel',
                    value: `[Open Meeting Admin](${adminUrl})`,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        }],
    });
}

/**
 * Send admin alert when a task fails
 */
export async function sendTaskFailedAdminAlert(data: {
    taskType: string;
    cityName: string;
    meetingName: string;
    taskId: string;
    cityId: string;
    meetingId: string;
    error?: string;
}): Promise<void> {
    const adminUrl = `${env.NEXT_PUBLIC_BASE_URL}/${data.cityId}/${data.meetingId}/admin`;

    await sendDiscordMessage({
        embeds: [{
            title: `❌ ${data.taskType} - ${data.cityId}`,
            description: `Failed: ${data.meetingId}`,
            color: 0xff0000, // Red
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
                    value: `[Open Meeting Admin](${adminUrl})`,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        }],
    });
}

/**
 * Send admin alert when a user completes onboarding
 */
export async function sendUserOnboardedAdminAlert(data: {
    cityName: string;
    onboardingSource: 'notification_preferences' | 'petition' | 'admin_invite' | 'magic_link';
}): Promise<void> {
    const sourceLabels = {
        notification_preferences: 'Notification Preferences',
        petition: 'Petition',
        admin_invite: 'Admin Invite',
        magic_link: 'Magic Link',
    };

    await sendDiscordMessage({
        embeds: [{
            title: '✨ User Onboarded',
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
            timestamp: new Date().toISOString(),
            footer: {
                text: 'PII not transmitted for privacy',
            },
        }],
    });
}

/**
 * Send admin alert when a petition is received
 */
export async function sendPetitionReceivedAdminAlert(data: {
    cityName: string;
    isResident: boolean;
    isCitizen: boolean;
}): Promise<void> {
    await sendDiscordMessage({
        embeds: [{
            title: '📝 New Petition Received',
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
            timestamp: new Date().toISOString(),
            footer: {
                text: 'PII not transmitted for privacy',
            },
        }],
    });
}

/**
 * Send admin alert when someone signs up for notifications
 */
export async function sendNotificationSignupAdminAlert(data: {
    cityName: string;
    locationCount: number;
    topicCount: number;
}): Promise<void> {
    await sendDiscordMessage({
        embeds: [{
            title: '🔔 New Notification Signup',
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
            timestamp: new Date().toISOString(),
            footer: {
                text: 'PII not transmitted for privacy',
            },
        }],
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
    const meetingUrl = `${env.NEXT_PUBLIC_BASE_URL}/${data.cityId}/${data.meetingId}`;
    const adminNotificationsUrl = `${env.NEXT_PUBLIC_BASE_URL}/admin/notifications`;

    await sendDiscordMessage({
        embeds: [{
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
                    value: `[View Meeting](${meetingUrl}) | [Manage Notifications](${adminNotificationsUrl})`,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        }],
    });
}

/**
 * Send admin alert when notifications are sent/released
 */
export async function sendNotificationsSentAdminAlert(data: {
    notificationCount: number;
    emailsSent: number;
    messagesSent: number;
    failed: number;
}): Promise<void> {
    // Only send if we actually sent some notifications
    if (data.emailsSent === 0 && data.messagesSent === 0 && data.failed === 0) {
        return;
    }

    const adminNotificationsUrl = `${env.NEXT_PUBLIC_BASE_URL}/admin/notifications`;
    const color = data.failed > 0 ? 0xe74c3c : 0x2ecc71; // Red if failures, green if all success

    await sendDiscordMessage({
        embeds: [{
            title: `📤 Notifications Sent`,
            description: `Delivery batch completed for ${data.notificationCount} notifications`,
            color,
            fields: [
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
                    name: 'Manage',
                    value: `[View All Notifications](${adminNotificationsUrl})`,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        }],
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
    const meetingUrl = `${env.NEXT_PUBLIC_BASE_URL}/${data.cityId}/${data.meetingId}`;
    const adminReviewsUrl = `${env.NEXT_PUBLIC_BASE_URL}/admin/reviews`;

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
            value: `[Open Meeting](${meetingUrl})`,
            inline: true,
        },
        {
            name: 'All Reviews',
            value: `[View All Reviews](${adminReviewsUrl})`,
            inline: false,
        }
    );

    await sendDiscordMessage({
        embeds: [{
            title: `✅ Human Review Completed - ${data.cityId}`,
            description: `${data.meetingId}`,
            color: 0x2ecc71, // Green
            fields,
            timestamp: new Date().toISOString(),
        }],
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
    const meetingUrl = `${env.NEXT_PUBLIC_BASE_URL}/${data.cityId}/${data.meetingId}`;

    await sendDiscordMessage({
        embeds: [{
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
                    value: `[Open in OpenCouncil](${meetingUrl})`,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        }],
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
    const meetingUrl = `${env.NEXT_PUBLIC_BASE_URL}/${data.cityId}/${data.meetingId}`;

    await sendDiscordMessage({
        embeds: [{
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
                    value: `[Open in OpenCouncil](${meetingUrl})`,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        }],
    });
}
