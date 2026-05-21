"use server";

import { sendEmail } from '@/lib/email/resend';
import { getPendingDeliveries, updateDeliveryStatus } from '@/lib/db/notifications';
import {
    createOrUpdateConversation,
    sendSMSMessage,
} from './bird';
import { sendAndPersistOutbound } from './outbound';
import { renderAfterMeetingSms, renderBeforeMeetingSms } from './sms-templates';
import { env } from '@/env.mjs';

/**
 * Release notifications by sending all pending deliveries
 */
export async function releaseNotifications(notificationIds: string[]): Promise<{
    success: boolean;
    emailsSent: number;
    messagesSent: number;
    failed: number;
}> {
    let emailsSent = 0;
    let messagesSent = 0;
    let failed = 0;

    try {
        // Get all pending deliveries for these notifications
        const pendingDeliveries = await getPendingDeliveries(notificationIds);

        console.log(`Releasing ${pendingDeliveries.length} pending deliveries for ${notificationIds.length} notifications`);

        // Process each delivery
        for (const delivery of pendingDeliveries) {
            try {
                if (delivery.medium === 'email') {
                    const result = await sendEmailDelivery(delivery);
                    if (result) {
                        emailsSent++;
                    } else {
                        failed++;
                    }
                } else if (delivery.medium === 'message') {
                    const result = await sendMessageDelivery(delivery);
                    if (result) {
                        messagesSent++;
                    } else {
                        failed++;
                    }
                }

                // Add a small delay to avoid rate limiting
                // 500ms delay allows for ~2 requests per second, which is a safe limit for most services
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`Error sending delivery ${delivery.id}:`, error);
                await updateDeliveryStatus(delivery.id, 'failed');
                failed++;
            }
        }

        console.log(`Release complete: ${emailsSent} emails, ${messagesSent} messages, ${failed} failed`);

        return {
            success: true,
            emailsSent,
            messagesSent,
            failed
        };
    } catch (error) {
        console.error('Error releasing notifications:', error);
        return {
            success: false,
            emailsSent,
            messagesSent,
            failed
        };
    }
}

/**
 * Send email delivery via Resend
 */
async function sendEmailDelivery(delivery: any): Promise<boolean> {
    try {
        if (!delivery.email || !delivery.title || !delivery.body) {
            console.error('Missing email, title, or body for delivery', delivery.id);
            await updateDeliveryStatus(delivery.id, 'failed');
            return false;
        }

        const result = await sendEmail({
            from: 'OpenCouncil <notifications@opencouncil.gr>',
            to: delivery.email,
            subject: delivery.title,
            html: delivery.body
        });

        if (result.success) {
            await updateDeliveryStatus(delivery.id, 'sent');
            console.log(`Email sent successfully to ${delivery.email}`);
            return true;
        } else {
            await updateDeliveryStatus(delivery.id, 'failed');
            console.error(`Failed to send email to ${delivery.email}`);
            return false;
        }
    } catch (error) {
        console.error('Error sending email delivery:', error);
        await updateDeliveryStatus(delivery.id, 'failed');
        return false;
    }
}

/**
 * Send message delivery via Bird (WhatsApp template → SMS fallback).
 *
 * First send creates a Bird conversation via the Conversations API so every
 * subsequent inbound + outbound message lands in the same conversation.
 */
async function sendMessageDelivery(delivery: any): Promise<boolean> {
    try {
        if (!delivery.phone) {
            console.error('Missing phone for delivery', delivery.id);
            await updateDeliveryStatus(delivery.id, 'failed');
            return false;
        }

        // Check if Bird API is configured
        if (!env.BIRD_API_KEY) {
            console.warn('Bird API not configured, skipping message delivery');
            await updateDeliveryStatus(delivery.id, 'failed');
            return false;
        }

        const notification = delivery.notification;
        const meeting = notification.meeting;

        // Prepare WhatsApp template parameters
        const templateParams = {
            date: meeting.dateTime.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' }),
            cityName: notification.city.name,
            subjectsSummary: notification.subjects.slice(0, 3).map((ns: any) => ns.subject.name).join(', '),
            adminBody: meeting.administrativeBody?.name || 'Συνεδρίαση',
            notificationId: notification.id
        };

        // Route through the most recent Bird conversation we have on file for
        // this phone, or create a new one if none exists. Guard on `success`
        // only — Bird sometimes returns 2xx with no message ID, and falling
        // through to SMS in that case would silently double-send.
        const waResult = await sendAndPersistOutbound({
            notificationDeliveryId: delivery.id,
            channel: 'whatsapp',
            phone: delivery.phone,
            body: delivery.body || '[template]',
            send: () => createOrUpdateConversation({
                phone: delivery.phone,
                notificationType: notification.type,
                params: templateParams,
                notificationDeliveryId: delivery.id,
            }),
        });

        if (waResult.success && waResult.finalStatus !== 'failed') {
            await updateDeliveryStatus(delivery.id, 'sent', 'whatsapp');
            console.log(`WhatsApp conversation seeded for ${delivery.phone}`);
            return true;
        }
        // Fall through to SMS — either the send failed, or post-send
        // reconciliation reported a terminal failure (24h window, blocked
        // recipient, etc.).
        console.log(
            waResult.success
                ? `WhatsApp delivery failed post-send for ${delivery.phone}, falling back to SMS`
                : `WhatsApp create-conversation failed for ${delivery.phone}: ${waResult.error}`,
        );

        const smsBody = notification.type === 'beforeMeeting'
            ? renderBeforeMeetingSms(templateParams)
            : renderAfterMeetingSms(templateParams);
        const smsResult = await sendAndPersistOutbound({
            notificationDeliveryId: delivery.id,
            channel: 'sms',
            phone: delivery.phone,
            body: smsBody,
            send: () => sendSMSMessage(delivery.phone, smsBody),
        });

        if (smsResult.success && smsResult.finalStatus !== 'failed') {
            await updateDeliveryStatus(delivery.id, 'sent', 'sms');
            console.log(`SMS sent successfully to ${delivery.phone}`);
            return true;
        }

        // Both failed
        await updateDeliveryStatus(delivery.id, 'failed');
        console.error(`Failed to send message to ${delivery.phone} via WhatsApp and SMS`);
        return false;

    } catch (error) {
        console.error('Error sending message delivery:', error);
        await updateDeliveryStatus(delivery.id, 'failed');
        return false;
    }
}

