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

const BIRD_TERMINAL_STATUSES = ['delivered', 'delivery_failed', 'sending_failed', 'rejected', 'skipped'] as const;

const POLL_MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch current status of a Bird message via the list endpoint
 */
async function getMessageStatus(channelId: string, messageId: string): Promise<string | null> {
    try {
        const response = await fetch(
            `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${channelId}/messages?id=${messageId}`,
            {
                headers: {
                    'Authorization': `AccessKey ${env.BIRD_API_KEY}`,
                }
            }
        );

        if (!response.ok) {
            console.error(`Bird GET message status error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const results = data.results;
        if (Array.isArray(results) && results.length > 0) {
            return results[0].status ?? null;
        }
        return null;
    } catch (error) {
        console.error('Error fetching Bird message status:', error);
        return null;
    }
}

/**
 * Poll Bird API until message reaches a terminal status or timeout.
 * Returns the terminal status string, or null if polling timed out.
 */
async function pollForDeliveryStatus(
    channelId: string,
    messageId: string
): Promise<string | null> {
    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS);

        const status = await getMessageStatus(channelId, messageId);
        console.log(`Bird message ${messageId} poll ${attempt}/${POLL_MAX_ATTEMPTS}: status=${status}`);

        if (status && (BIRD_TERMINAL_STATUSES as readonly string[]).includes(status)) {
            return status;
        }
    }

    console.log(`Bird message ${messageId} polling timed out after ${POLL_MAX_ATTEMPTS} attempts`);
    return null;
}

/**
 * Check polling result and return success/failure for WhatsApp delivery.
 * Called after a successful Bird POST to determine actual delivery outcome.
 */
function resolveDeliveryResult(
    finalStatus: string | null,
    phoneNumber: string
): { success: boolean; error?: string } {
    if (finalStatus === 'delivered') {
        return { success: true };
    }

    if (finalStatus === 'delivery_failed' || finalStatus === 'sending_failed' || finalStatus === 'rejected' || finalStatus === 'skipped') {
        console.log(`WhatsApp delivery failed for ${phoneNumber}: status=${finalStatus}`);
        return { success: false, error: `WhatsApp delivery status: ${finalStatus}` };
    }

    // Timeout (null) — optimistic, same as previous behavior
    console.log(`WhatsApp delivery status unknown for ${phoneNumber}, treating as success`);
    return { success: true };
}

/**
 * Make Bird API request with error handling
 */
async function makeBirdRequest(
    url: string,
    payload: unknown,
    logPrefix: string
): Promise<{ success: boolean; error?: string; messageId?: string }> {
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
        if (result.status === 'failed' || result.status === 'rejected') {
            return {
                success: false,
                error: result.detail || result.title || `Bird status: ${result.status}`
            };
        }

        return { success: true, messageId: result.id };
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
    console.log(`WhatsApp send to ${phoneNumber} (SIMULATE_WHATSAPP_UNAVAILABLE=${process.env.SIMULATE_WHATSAPP_UNAVAILABLE ? 'true' : 'false'})`);

    if (process.env.SIMULATE_WHATSAPP_UNAVAILABLE) {
        console.log(`[Simulated] WhatsApp unavailable for ${phoneNumber}, will fall back to SMS`);
        return { success: false, error: 'Simulated: WhatsApp unavailable' };
    }

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

    const result = await makeBirdRequest(
        `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_WHATSAPP_CHANNEL_ID}/messages`,
        payload,
        'WhatsApp message'
    );

    if (!result.success || !result.messageId) {
        return { success: result.success, error: result.error };
    }

    const finalStatus = await pollForDeliveryStatus(env.BIRD_WHATSAPP_CHANNEL_ID!, result.messageId);
    return resolveDeliveryResult(finalStatus, phoneNumber);
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
    if (process.env.SIMULATE_WHATSAPP_UNAVAILABLE) {
        console.log(`[Simulated] WhatsApp unavailable for ${phoneNumber}, will fall back to SMS`);
        return { success: false, error: 'Simulated: WhatsApp unavailable' };
    }

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

    const result = await makeBirdRequest(
        `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_WHATSAPP_CHANNEL_ID}/messages`,
        payload,
        'WhatsApp welcome message'
    );

    if (!result.success || !result.messageId) {
        return { success: result.success, error: result.error };
    }

    const finalStatus = await pollForDeliveryStatus(env.BIRD_WHATSAPP_CHANNEL_ID!, result.messageId);
    return resolveDeliveryResult(finalStatus, phoneNumber);
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
