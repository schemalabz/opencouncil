import "server-only";

import prisma from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/resend';
import { renderReactEmailToHtml } from '@/lib/email/render';
import { WelcomeEmail } from '@/lib/email/templates/WelcomeEmail';
import { klitiki } from '@/lib/utils';

interface City {
    name: string;
    name_municipality: string;
}

/**
 * Send the welcome email when a reader signs up for notifications. The
 * WhatsApp side of the welcome is Notis's: its poller enrolls the reader on
 * the next tick and opens the thread with the intro shell.
 */
export async function sendWelcomeEmail(userId: string, city: City) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            console.error('User not found for welcome email');
            return;
        }

        const userName = user.name ? klitiki(user.name) : 'φίλε μας';

        const welcomeEmailHtml = await renderReactEmailToHtml(
            WelcomeEmail({ userName, cityName: city.name_municipality })
        );

        await sendEmail({
            from: 'OpenCouncil <notifications@opencouncil.gr>',
            to: user.email,
            subject: `Καλώς ήρθατε στο OpenCouncil - ${city.name}`,
            html: welcomeEmailHtml
        });
    } catch (error) {
        console.error('Error sending welcome email:', error);
        // Don't throw - the welcome email is nice-to-have, not critical
    }
}
