"use server";
import { Resend } from 'resend';
import { env } from '@/env.mjs';

interface EmailParams {
    from: string;
    to: string;
    cc?: string;
    subject: string;
    html: string;
    text?: string;
}

export async function sendEmail(params: EmailParams) {
    const resend = new Resend(env.RESEND_API_KEY);
    const { from, to, cc, subject, html, text } = params;

    try {
        const result = await resend.emails.send({
            from,
            to,
            cc,
            subject,
            html,
            text,
        });

        if (result.error) {
            console.error('Failed to send email:', result);
            throw new Error("An error occurred while sending the email");
        }

        console.log('Email sent successfully:', result);
        return { success: true, message: 'Email sent successfully' };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, message: 'Failed to send email' };
    }
}
