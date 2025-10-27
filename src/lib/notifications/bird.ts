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
 * Send WhatsApp message via Bird API using pre-approved templates
 */
export async function sendWhatsAppMessage(
    phoneNumber: string,
    notificationType: 'beforeMeeting' | 'afterMeeting',
    params: WhatsAppTemplateParams
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID || !env.BIRD_WHATSAPP_CHANNEL_ID) {
            console.error('Bird WhatsApp credentials not configured');
            return { success: false, error: 'Bird WhatsApp not configured' };
        }

        // Get template project ID from environment variables
        const templateProjectId = notificationType === 'beforeMeeting'
            ? env.BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING
            : env.BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING;

        if (!templateProjectId) {
            console.error(`WhatsApp template project ID not configured for ${notificationType}`);
            return { success: false, error: 'Template project ID not configured' };
        }

        // Format phone number (ensure it starts with +)
        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

        // Construct notification URL
        const notificationUrl = `${env.NEXT_PUBLIC_BASE_URL || 'https://opencouncil.gr'}/notifications/${params.notificationId}`;

        // Construct the request payload according to Bird API format
        // See: https://docs.bird.com/api/channels-api/supported-channels/programmable-whatsapp/sending-whatsapp-messages
        const payload = {
            receiver: {
                contacts: [
                    {
                        identifierValue: formattedPhone
                    }
                ]
            },
            template: {
                projectId: templateProjectId, // Template project ID (UUID) from Bird Studio
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

        console.log('Bird WhatsApp API request:', JSON.stringify(payload, null, 2));

        // Bird WhatsApp API request (HSM template format)
        const response = await fetch(`https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_WHATSAPP_CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `AccessKey ${env.BIRD_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Bird WhatsApp API error:', response.status, errorText);
            return { success: false, error: `API returned ${response.status}` };
        }

        const result = await response.json();
        console.log('WhatsApp message sent via Bird:', result);

        return { success: true };

    } catch (error) {
        console.error('Error sending WhatsApp message via Bird:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Send SMS message via Bird API as fallback
 */
export async function sendSMSMessage(
    phoneNumber: string,
    message: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID || !env.BIRD_SMS_CHANNEL_ID) {
            console.error('Bird SMS credentials not configured');
            return { success: false, error: 'Bird SMS not configured' };
        }

        // Format phone number (ensure it starts with +)
        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

        // Bird SMS API request
        const response = await fetch(`https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_SMS_CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `AccessKey ${env.BIRD_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                receiver: {
                    contacts: [
                        {
                            identifierValue: formattedPhone
                        }
                    ]
                },
                body: {
                    type: 'text',
                    text: {
                        text: message
                    }
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Bird SMS API error:', response.status, errorText);
            return { success: false, error: `API returned ${response.status}` };
        }

        const result = await response.json();
        console.log('SMS sent via Bird:', result);

        return { success: true };

    } catch (error) {
        console.error('Error sending SMS via Bird:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Send welcome WhatsApp message when user signs up for notifications
 */
export async function sendWelcomeWhatsAppMessage(
    phoneNumber: string,
    userName: string,
    cityName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID || !env.BIRD_WHATSAPP_CHANNEL_ID) {
            console.error('Bird WhatsApp credentials not configured');
            return { success: false, error: 'Bird WhatsApp not configured' };
        }

        const templateProjectId = env.BIRD_WHATSAPP_TEMPLATE_WELCOME;

        if (!templateProjectId) {
            console.error('WhatsApp welcome template project ID not configured');
            return { success: false, error: 'Welcome template not configured' };
        }

        // Format phone number (ensure it starts with +)
        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

        // Construct the request payload
        const payload = {
            receiver: {
                contacts: [
                    {
                        identifierValue: formattedPhone
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

        const response = await fetch(`https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_WHATSAPP_CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `AccessKey ${env.BIRD_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Bird WhatsApp welcome API error:', response.status, errorText);
            return { success: false, error: `API returned ${response.status}` };
        }

        const result = await response.json();
        console.log('WhatsApp welcome message sent via Bird:', result);

        return { success: true };

    } catch (error) {
        console.error('Error sending WhatsApp welcome message via Bird:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Send welcome SMS when user signs up for notifications
 */
export async function sendWelcomeSMS(
    phoneNumber: string,
    userName: string,
    cityName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID || !env.BIRD_SMS_CHANNEL_ID) {
            console.error('Bird SMS credentials not configured');
            return { success: false, error: 'Bird SMS not configured' };
        }

        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

        const message = `Γεια σας ${userName}! Εγγραφήκατε επιτυχώς για ειδοποιήσεις από το OpenCouncil για ${cityName}. Θα λαμβάνετε ενημερώσεις για θέματα που σας αφορούν.`;

        const response = await fetch(`https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_SMS_CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `AccessKey ${env.BIRD_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                receiver: {
                    contacts: [
                        {
                            identifierValue: formattedPhone
                        }
                    ]
                },
                body: {
                    type: 'text',
                    text: {
                        text: message
                    }
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Bird welcome SMS API error:', response.status, errorText);
            return { success: false, error: `API returned ${response.status}` };
        }

        const result = await response.json();
        console.log('Welcome SMS sent via Bird:', result);

        return { success: true };

    } catch (error) {
        console.error('Error sending welcome SMS via Bird:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
