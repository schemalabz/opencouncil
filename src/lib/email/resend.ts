"use server";
import { Resend } from 'resend';
import { env } from '@/env.mjs';

interface EmailParams {
    from: string;
    to: string;
    cc?: string | string[];
    subject: string;
    html: string;
    text?: string;
}

export async function sendEmail(params: EmailParams) {
    const resend = new Resend(env.RESEND_API_KEY);
    let { from, to, cc, subject, html, text } = params;

    // Development/preview email override: redirect all emails to a single address
    // Works in dev mode (NODE_ENV !== 'production') or preview deployments (IS_PREVIEW=true)
    const isDev = process.env.NODE_ENV !== 'production';
    const isPreview = process.env.IS_PREVIEW === 'true';
    const devEmailOverride = env.DEV_EMAIL_OVERRIDE;

    if ((isDev || isPreview) && devEmailOverride) {
        const originalTo = to;
        const originalCc = cc;
        
        // Redirect email to dev address
        to = devEmailOverride;
        cc = undefined; // Clear CC to avoid sending to real addresses
        
        // Modify subject to include original recipient
        subject = `[DEV → ${originalTo}] ${subject}`;
        
        // Log for debugging
        console.log(`📧 Dev mode: Redirecting email from "${originalTo}" to "${devEmailOverride}"`);
        if (originalCc) {
            console.log(`   Original CC: ${originalCc}`);
        }
    }

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
