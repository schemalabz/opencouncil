"use server";

import { render } from "@react-email/components";
import { sendEmail } from "./resend";
import { ConsultationCommentEmail } from "./templates/consultation-comment";
import { env } from "@/env.mjs";

interface ConsultationCommentEmailData {
    userName: string;
    userEmail: string;
    consultationTitle: string;
    entityType: 'chapter' | 'article' | 'geoset' | 'geometry';
    entityId: string;
    /** The place or section, named as the screens name it (entityLabel). */
    entityLabel: string;
    commentBody: string;
    consultationUrl: string;
    municipalityEmail: string;
    ccEmails?: string[];
}

export async function sendConsultationCommentEmail(data: ConsultationCommentEmailData) {
    const {
        userName,
        userEmail,
        consultationTitle,
        entityType,
        entityId,
        entityLabel,
        commentBody,
        consultationUrl,
        municipalityEmail,
        ccEmails
    } = data;

    const subject = `Διαβούλευση "${consultationTitle}" (${entityLabel})`;

    // Render the email HTML
    const emailHtml = await render(
        ConsultationCommentEmail({
            userName,
            userEmail,
            consultationTitle,
            entityType,
            entityId,
            entityLabel,
            commentBody,
            consultationUrl
        })
    );

    // Send email to municipality with user and additional emails CC'd
    const allCcEmails = [userEmail];
    if (ccEmails && ccEmails.length > 0) {
        allCcEmails.push(...ccEmails);
    }

    const result = await sendEmail({
        from: 'OpenCouncil <noreply@opencouncil.gr>',
        to: municipalityEmail,
        cc: allCcEmails,
        subject,
        html: emailHtml,
    });

    return result;
} 