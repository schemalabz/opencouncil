"use server";
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailParams {
    from: string;
    to: string;
    cc?: string;
    subject: string;
    html: string;
    text?: string;
}

export async function sendEmail(params: EmailParams) {
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
