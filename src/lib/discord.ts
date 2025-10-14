/**
 * Discord Admin Alerts Integration
 * 
 * This module provides utilities to send admin alerts to a Discord channel
 * via webhook for important system events.
 */

import { env } from '@/env.mjs';

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

