import "server-only";

import { sendEmail } from '@/lib/email/resend';
import { getPendingDeliveries, updateDeliveryStatus } from '@/lib/db/notifications';

/**
 * Release notifications by sending all pending deliveries.
 *
 * Only email is sent from here. WhatsApp and SMS are Notis's for every
 * reader, so a `message` delivery can only be a row created before the
 * switch (or by the admin test-send tool) and is marked skipped, never sent.
 */
export async function releaseNotifications(notificationIds: string[]): Promise<{
    success: boolean;
    emailsSent: number;
    messagesSent: number;
    skipped: number;
    failed: number;
}> {
    let emailsSent = 0;
    let skipped = 0;
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
                    await updateDeliveryStatus(delivery.id, 'skipped');
                    skipped++;
                    continue;
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

        console.log(`Release complete: ${emailsSent} emails, ${skipped} skipped, ${failed} failed`);

        return {
            success: true,
            emailsSent,
            messagesSent: 0,
            skipped,
            failed
        };
    } catch (error) {
        console.error('Error releasing notifications:', error);
        return {
            success: false,
            emailsSent,
            messagesSent: 0,
            skipped,
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
