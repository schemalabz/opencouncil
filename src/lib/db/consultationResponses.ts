import "server-only";
import type { Prisma } from '@prisma/client';
import prisma from "./prisma";
import { getCurrentUser, isUserAuthorizedToEdit } from "@/lib/auth";
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/api/errors";
import { COMMENT_MAX_LENGTH, fetchRegulationData } from "./consultationComments";
import { consultationCommentResponseSelect, type ConsultationCommentResponseView } from "./types/consultation";
import { sendConsultationResponseEmail } from "@/lib/email/consultationResponse";
import { emailLocaleForRealm } from "@/lib/email/emailLocale";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";
import { commentHtmlToPlainText, normalizeNonBreakingSpaces, plainTextToCommentHtml } from "@/lib/utils/commentText";
import { buildConsultationUrl } from "@/components/consultations/consultationUrl";
import { describeEntity, entityLabel, extractGeoSets } from "@/components/consultations/entityDisplay";

/*
 * The municipality's response under a consultation comment. An administrator of the comment's
 * city (or a superadmin) writes one, in the municipality's name; the author and the municipality
 * get one email, once, that joins them. This module imports "@/lib/auth", so it stays apart from
 * consultationComments.ts, which src/auth.ts loads.
 */

const respondableCommentSelect = {
    id: true,
    body: true,
    entityId: true,
    cityId: true,
    consultationId: true,
    user: { select: { name: true, email: true } },
    consultation: {
        select: {
            id: true,
            name: true,
            jsonUrl: true,
            city: { select: { realm: true, name_municipality: true } },
        },
    },
    response: { select: { id: true, emailSentAt: true } },
} satisfies Prisma.ConsultationCommentSelect;

type RespondableComment = Prisma.ConsultationCommentGetPayload<{ select: typeof respondableCommentSelect }>;
type Administrator = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** The comment, for a signed-in administrator of its city or a superadmin. Comments are public, so an unknown id says so before the permission check. */
async function respondableComment(commentId: string): Promise<{ user: Administrator; comment: RespondableComment }> {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();
    const comment = await prisma.consultationComment.findUnique({ where: { id: commentId }, select: respondableCommentSelect });
    if (!comment) throw new NotFoundError('Comment not found');
    if (!(await isUserAuthorizedToEdit({ cityId: comment.cityId }))) {
        throw new ForbiddenError('Only an administrator of the city can answer for the municipality');
    }
    return { user, comment };
}

export interface RespondResult {
    response: ConsultationCommentResponseView;
    /** False when the municipality replaced an earlier response. */
    created: boolean;
    /** Whether the email that joins the author and the municipality has gone out, now or earlier. */
    emailSent: boolean;
}

/**
 * Publishes the municipality's response to a comment, or replaces the one it has. `text` is the
 * administrator's plain text. Allowed after the consultation ended: the municipality answers
 * when the council has discussed the plan. The email goes once, on the first save that sends it.
 */
export async function respondToConsultationComment(commentId: string, text: string): Promise<RespondResult> {
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestError('Response body cannot be empty');
    if (text.length > COMMENT_MAX_LENGTH) throw new BadRequestError(`Response body cannot exceed ${COMMENT_MAX_LENGTH} characters`);

    const { user, comment } = await respondableComment(commentId);
    const body = plainTextToCommentHtml(text);
    const existing = comment.response;
    const response = existing
        ? await prisma.consultationCommentResponse.update({
            where: { id: existing.id },
            data: { body, authorUserId: user.id },
            select: consultationCommentResponseSelect,
        })
        : await prisma.consultationCommentResponse.create({
            data: { commentId, body, authorUserId: user.id },
            select: consultationCommentResponseSelect,
        });

    let emailSent = !!existing?.emailSentAt;
    if (!emailSent) {
        emailSent = await notifyParties(comment, user, body);
        if (emailSent) {
            await prisma.consultationCommentResponse.update({ where: { commentId }, data: { emailSentAt: new Date() } });
        }
    }
    return { response, created: !existing, emailSent };
}

/** Removes the municipality's response. Nothing to remove is not an error. */
export async function deleteConsultationCommentResponse(commentId: string): Promise<void> {
    await respondableComment(commentId);
    await prisma.consultationCommentResponse.deleteMany({ where: { commentId } });
}

/** One email to the author, with the municipality in CC. A failure is logged and reported, not thrown. */
async function notifyParties(comment: RespondableComment, admin: Administrator, responseBody: string): Promise<boolean> {
    try {
        const { consultation } = comment;
        const regulationData = await fetchRegulationData(consultation.jsonUrl);
        const display = regulationData ? describeEntity(regulationData, extractGeoSets(regulationData), comment.entityId) : null;
        // The email is read outside the site, so the link must name the city's domain.
        const consultationUrl = `${realmBaseUrl(consultation.city.realm)}/${comment.cityId}/consultation/${consultation.id}`;
        return await sendConsultationResponseEmail({
            authorName: comment.user.name || null,
            authorEmail: comment.user.email,
            adminEmail: admin.email,
            contactEmail: regulationData?.contactEmail,
            ccEmails: regulationData?.ccEmails,
            municipalityName: consultation.city.name_municipality,
            consultationTitle: regulationData?.title || consultation.name,
            entityLabel: display ? entityLabel(display) : null,
            // Older comments came from a rich editor and may hold &nbsp;.
            commentText: commentHtmlToPlainText(normalizeNonBreakingSpaces(comment.body)),
            responseText: commentHtmlToPlainText(responseBody),
            commentUrl: buildConsultationUrl(consultationUrl, { view: 'comment', entityId: comment.entityId }),
            locale: emailLocaleForRealm(consultation.city.realm),
        });
    } catch (error) {
        console.error('Failed to send the consultation response email:', error);
        return false;
    }
}
