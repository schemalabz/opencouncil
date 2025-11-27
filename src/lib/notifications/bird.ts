"use server";

import { env } from '@/env.mjs';

interface WhatsAppTemplateParams {
    date: string;
    cityName: string;
    subjectsSummary: string;
    adminBody: string;
    notificationId: string;
}

/**
 * Format phone number to ensure it starts with +
 */
function formatPhoneNumber(phoneNumber: string): string {
    return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
}

/**
 * Check if Bird credentials are configured
 */
function checkCredentials(channelId: string | undefined, serviceName: string): { configured: boolean; error?: string } {
    if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID || !channelId) {
        return { configured: false, error: `Bird ${serviceName} not configured` };
    }
    return { configured: true };
}

/**
 * Make Bird API request with error handling
 */
async function makeBirdRequest(
    url: string,
    payload: unknown,
    logPrefix: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `AccessKey ${env.BIRD_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`${logPrefix} API error:`, response.status, errorText);
            return { success: false, error: `API returned ${response.status}` };
        }

        const result = await response.json();
        console.log(`${logPrefix} sent via Bird:`, result);

        // Check for immediate failure in response body even if status is 2xx
        // Bird returns 202 Accepted, which means it's queued.
        // We consider this a success for now, but we should eventually use webhooks for real delivery status.
        if (result.status === 'failed' || result.status === 'rejected') {
            return {
                success: false,
                error: result.detail || result.title || `Bird status: ${result.status}`
            };
        }

        return { success: true };
    } catch (error) {
        console.error(`Error ${logPrefix.toLowerCase()}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Send WhatsApp message via Bird API using pre-approved templates
 */
export async function sendWhatsAppMessage(
    phoneNumber: string,
    notificationType: 'beforeMeeting' | 'afterMeeting',
    params: WhatsAppTemplateParams
): Promise<{ success: boolean; error?: string }> {
    const credentialsCheck = checkCredentials(env.BIRD_WHATSAPP_CHANNEL_ID, 'WhatsApp');
    if (!credentialsCheck.configured) {
        console.error('Bird WhatsApp credentials not configured');
        return { success: false, error: credentialsCheck.error };
    }

    const templateProjectId = notificationType === 'beforeMeeting'
        ? env.BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING
        : env.BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING;

    if (!templateProjectId) {
        console.error(`WhatsApp template project ID not configured for ${notificationType}`);
        return { success: false, error: 'Template project ID not configured' };
    }

    const payload = {
        receiver: {
            contacts: [
                {
                    identifierValue: formatPhoneNumber(phoneNumber)
                }
            ]
        },
        template: {
            projectId: templateProjectId,
            version: 'latest',
            locale: 'el',
            parameters: [
                {
                    type: 'string',
                    key: 'date',
                    value: params.date
                },
                {
                    type: 'string',
                    key: 'cityName',
                    value: params.cityName
                },
                {
                    type: 'string',
                    key: 'subjectsSummary',
                    value: params.subjectsSummary
                },
                {
                    type: 'string',
                    key: 'adminBody',
                    value: params.adminBody
                },
                {
                    type: 'string',
                    key: 'notificationId',
                    value: params.notificationId
                }
            ]
        }
    };

    return makeBirdRequest(
        `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_WHATSAPP_CHANNEL_ID}/messages`,
        payload,
        'WhatsApp message'
    );
}

/**
 * Send SMS message via Bird API as fallback
 */
export async function sendSMSMessage(
    phoneNumber: string,
    message: string
): Promise<{ success: boolean; error?: string }> {
    const credentialsCheck = checkCredentials(env.BIRD_SMS_CHANNEL_ID, 'SMS');
    if (!credentialsCheck.configured) {
        console.error('Bird SMS credentials not configured');
        return { success: false, error: credentialsCheck.error };
    }

    const payload = {
        receiver: {
            contacts: [
                {
                    identifierValue: formatPhoneNumber(phoneNumber)
                }
            ]
        },
        body: {
            type: 'text',
            text: {
                text: message
            }
        }
    };

    return makeBirdRequest(
        `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_SMS_CHANNEL_ID}/messages`,
        payload,
        'SMS'
    );
}

/**
 * Send welcome WhatsApp message when user signs up for notifications
 */
export async function sendWelcomeWhatsAppMessage(
    phoneNumber: string,
    userName: string,
    cityName: string
): Promise<{ success: boolean; error?: string }> {
    const credentialsCheck = checkCredentials(env.BIRD_WHATSAPP_CHANNEL_ID, 'WhatsApp');
    if (!credentialsCheck.configured) {
        console.error('Bird WhatsApp credentials not configured');
        return { success: false, error: credentialsCheck.error };
    }

    const templateProjectId = env.BIRD_WHATSAPP_TEMPLATE_WELCOME;

    if (!templateProjectId) {
        console.error('WhatsApp welcome template project ID not configured');
        return { success: false, error: 'Welcome template not configured' };
    }

    const payload = {
        receiver: {
            contacts: [
                {
                    identifierValue: formatPhoneNumber(phoneNumber)
                }
            ]
        },
        template: {
            projectId: templateProjectId,
            version: 'latest',
            locale: 'el',
            parameters: [
                {
                    type: 'string',
                    key: 'userName',
                    value: userName
                },
                {
                    type: 'string',
                    key: 'cityName',
                    value: cityName
                }
            ]
        }
    };

    console.log('Bird WhatsApp welcome message request:', JSON.stringify(payload, null, 2));

    return makeBirdRequest(
        `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_WHATSAPP_CHANNEL_ID}/messages`,
        payload,
        'WhatsApp welcome message'
    );
}

/**
 * Send welcome SMS when user signs up for notifications
 */
export async function sendWelcomeSMS(
    phoneNumber: string,
    userName: string,
    cityName: string
): Promise<{ success: boolean; error?: string }> {
    const credentialsCheck = checkCredentials(env.BIRD_SMS_CHANNEL_ID, 'SMS');
    if (!credentialsCheck.configured) {
        console.error('Bird SMS credentials not configured');
        return { success: false, error: credentialsCheck.error };
    }

    const message = `Γεια σας ${userName}! Εγγραφήκατε επιτυχώς για ειδοποιήσεις από το OpenCouncil για ${cityName}. Θα λαμβάνετε ενημερώσεις για θέματα που σας αφορούν.`;

    const payload = {
        receiver: {
            contacts: [
                {
                    identifierValue: formatPhoneNumber(phoneNumber)
                }
            ]
        },
        body: {
            type: 'text',
            text: {
                text: message
            }
        }
    };

    return makeBirdRequest(
        `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_SMS_CHANNEL_ID}/messages`,
        payload,
        'Welcome SMS'
    );
}
