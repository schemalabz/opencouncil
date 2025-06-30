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
    entityTitle: string;
    entityNumber?: string;
    parentGeosetName?: string;
    commentBody: string;
    consultationUrl: string;
    municipalityEmail: string;
}

export async function sendConsultationCommentEmail(data: ConsultationCommentEmailData) {
    const {
        userName,
        userEmail,
        consultationTitle,
        entityType,
        entityId,
        entityTitle,
        entityNumber,
        parentGeosetName,
        commentBody,
        consultationUrl,
        municipalityEmail
    } = data;

    // Get the entity reference for the subject line
    const getEntityReference = () => {
        switch (entityType) {
            case 'chapter':
                return `το κεφάλαιο ${entityNumber ? `${entityNumber} ` : ''}${entityTitle}`;
            case 'article':
                return `το άρθρο ${entityNumber ? `${entityNumber} ` : ''}${entityTitle}`;
            case 'geoset':
            case 'geometry':
                return `την τοποθεσία "${entityTitle}"`;
            default:
                return `το στοιχείο ${entityTitle}`;
        }
    };

    const entityReference = getEntityReference();
    const subject = `Διαβούλευση "${consultationTitle}" (${entityReference})`;

    // Render the email HTML
    const emailHtml = await render(
        ConsultationCommentEmail({
            userName,
            userEmail,
            consultationTitle,
            entityType,
            entityId,
            entityTitle,
            entityNumber,
            parentGeosetName,
            commentBody,
            consultationUrl
        })
    );

    // Send email to municipality with user CC'd
    const result = await sendEmail({
        from: `OpenCouncil <noreply@${env.NEXT_PUBLIC_MAIN_DOMAIN || 'opencouncil.gr'}>`,
        to: municipalityEmail,
        cc: userEmail,
        subject,
        html: emailHtml,
    });

    return result;
} 