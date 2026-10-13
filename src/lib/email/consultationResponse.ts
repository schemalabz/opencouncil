import "server-only";
import { sendEmail } from './resend';
import { renderReactEmailToHtml } from './render';
import { ConsultationResponseEmail, consultationResponseCopy, type ConsultationResponseEmailProps } from './templates/ConsultationResponseEmail';

export interface ResponseRecipients {
    to: string;
    cc: string[];
    replyTo: string[];
}

/**
 * Who gets the email that carries a municipality's response: the comment's author, with the
 * administrator who answered and the consultation's contact addresses in CC. Each address once,
 * and the author never in CC. Everyone is in Reply-To, so a plain reply from either side reaches
 * the other; Reply-To names the same addresses for every recipient.
 */
export function responseRecipients({ authorEmail, adminEmail, contactEmail, ccEmails }: {
    authorEmail: string;
    adminEmail: string | null;
    contactEmail?: string | null;
    ccEmails?: string[] | null;
}): ResponseRecipients {
    const to = authorEmail.trim();
    const seen = new Set([to.toLowerCase()]);
    const cc: string[] = [];
    for (const candidate of [adminEmail, contactEmail, ...(ccEmails ?? [])]) {
        const address = candidate?.trim();
        if (!address || seen.has(address.toLowerCase())) continue;
        seen.add(address.toLowerCase());
        cc.push(address);
    }
    return { to, cc, replyTo: [to, ...cc] };
}

export type ConsultationResponseEmailData = ConsultationResponseEmailProps & {
    authorEmail: string;
    adminEmail: string | null;
    contactEmail?: string | null;
    ccEmails?: string[] | null;
};

/** Sends the response email. True when Resend accepted it. */
export async function sendConsultationResponseEmail(data: ConsultationResponseEmailData): Promise<boolean> {
    const copy = consultationResponseCopy(data.locale);
    const html = await renderReactEmailToHtml(ConsultationResponseEmail(data));
    const { to, cc, replyTo } = responseRecipients(data);
    const result = await sendEmail({
        from: 'notifications',
        to,
        cc: cc.length > 0 ? cc : undefined,
        replyTo,
        subject: copy.subject(data.consultationTitle),
        html,
    });
    return result.success;
}
