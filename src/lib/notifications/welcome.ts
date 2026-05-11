"use server";

import { sendEmail } from '@/lib/email/resend';
import { renderReactEmailToHtml } from '@/lib/email/render';
import { WelcomeEmail } from '@/lib/email/templates/WelcomeEmail';
import { createOrUpdateConversation, sendSMSMessage } from './bird';
import { sendAndPersistOutbound } from './outbound';
import { renderWelcomeSms } from './sms-templates';
import { klitiki } from '@/lib/utils';

interface City {
    name: string;
    name_municipality: string;
}

/**
 * Send welcome messages (email + WhatsApp/SMS) when user signs up for notifications
 */
export async function sendWelcomeMessages(userId: string, city: City, phone?: string) {
    try {
        // Get user details from DB
        const { default: prisma } = await import('@/lib/db/prisma');
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            console.error('User not found for welcome message');
            return;
        }

        const userName = user.name ? klitiki(user.name) : 'φίλε μας';

        // Render welcome email template
        const welcomeEmailHtml = await renderReactEmailToHtml(
            WelcomeEmail({ userName, cityName: city.name_municipality })
        );

        // Send welcome email
        sendEmail({
            from: 'OpenCouncil <notifications@opencouncil.gr>',
            to: user.email,
            subject: `Καλώς ήρθατε στο OpenCouncil - ${city.name}`,
            html: welcomeEmailHtml
        }).catch(err => console.error('Error sending welcome email:', err));

        // Send welcome WhatsApp/SMS if phone provided
        if (phone) {
            const waResult = await sendAndPersistOutbound({
                channel: 'whatsapp',
                phone,
                body: '[welcome template]',
                send: () => createOrUpdateConversation({
                    phone,
                    notificationType: 'welcome',
                    params: { userName, cityName: city.name },
                }),
            });

            // Fall back to SMS when the send failed, OR when reconciliation
            // later flagged the WhatsApp message as failed (24h window,
            // blocked recipient, etc.)
            if (!waResult.success || waResult.finalStatus === 'failed') {
                console.log(
                    'WhatsApp welcome failed, falling back to SMS:',
                    waResult.finalReason ?? waResult.error,
                );
                const smsBody = renderWelcomeSms({ userName, cityName: city.name });
                await sendAndPersistOutbound({
                    channel: 'sms',
                    phone,
                    body: smsBody,
                    send: () => sendSMSMessage(phone, smsBody),
                });
            }
        }

    } catch (error) {
        console.error('Error sending welcome messages:', error);
        // Don't throw - welcome messages are nice-to-have, not critical
    }
}

