import "server-only";
import { ConsultationCommentEntityType, type ConsultationComment, type Realm } from '@prisma/client';
import prisma from "./prisma";
import { env } from "@/env.mjs";
import { sendConsultationCommentEmail } from "@/lib/email/consultation";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";
import { commentHtmlToPlainText } from "@/lib/utils/commentText";
import { describeEntity, entityLabel, extractGeoSets } from "@/components/consultations/entityDisplay";
import type { PendingCommentConfirmation, RegulationData } from "@/components/consultations/types";

/*
 * Publishing a consultation comment, and the comments that wait for their author to confirm an
 * email address. This module must not import "@/auth" (directly or through "@/lib/auth"): the
 * Auth.js email provider in src/auth.ts quotes pending comments from here.
 */

/**
 * A pending comment lives as long as its confirmation link: the Resend magic link's default
 * `maxAge`, 24 hours. After that nothing can confirm it.
 */
export const PENDING_COMMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const COMMENT_MAX_LENGTH = 5000;

// Fetch regulation data from URL (exported for use in page components)
export async function fetchRegulationData(jsonUrl: string): Promise<RegulationData | null> {
    try {
        // Resolve relative URLs (e.g. /regulation.json) against the app's base URL
        const url = jsonUrl.startsWith('http') ? jsonUrl : `${env.NEXTAUTH_URL}${jsonUrl}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            console.error(`Failed to fetch regulation data: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching regulation data:', error);
        return null;
    }
}

/** Whether the regulation has the entity a comment targets, with that type. */
export function regulationHasEntity(
    regulationData: RegulationData,
    entityType: ConsultationCommentEntityType,
    entityId: string
): boolean {
    return describeEntity(regulationData, extractGeoSets(regulationData), entityId)?.commentType === entityType;
}

export interface PublishCommentInput {
    consultation: { id: string; cityId: string; city: { realm: Realm } };
    regulationData: RegulationData;
    userId: string;
    entityType: ConsultationCommentEntityType;
    entityId: string;
    /** Already rendered from the reader's plain text by plainTextToCommentHtml. */
    bodyHtml: string;
    /** When the reader wrote it; a confirmed pending comment keeps its submission time. */
    createdAt?: Date;
    /** Whether to email the municipality. */
    notify: boolean;
}

function commentData({ consultation, userId, entityType, entityId, bodyHtml, createdAt }: PublishCommentInput) {
    return {
        body: bodyHtml,
        entityType,
        entityId,
        userId,
        consultationId: consultation.id,
        cityId: consultation.cityId,
        ...(createdAt ? { createdAt } : {})
    };
}

/** Stores a comment and sends it to the municipality. The caller has checked the entity and the author. */
export async function publishConsultationComment(input: PublishCommentInput): Promise<ConsultationComment> {
    const comment = await prisma.consultationComment.create({ data: commentData(input) });
    await notifyMunicipality(input);
    return comment;
}

/** Emails a published comment to the municipality's contact address. A failure is logged, not thrown. */
async function notifyMunicipality(input: PublishCommentInput): Promise<void> {
    const { consultation, regulationData, userId, entityId, bodyHtml, notify } = input;
    if (notify && regulationData.contactEmail) {
        try {
            const display = describeEntity(regulationData, extractGeoSets(regulationData), entityId);
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
            if (display && user?.email) {
                // The email is read outside the site, so the link must name the city's domain.
                const consultationUrl = `${realmBaseUrl(consultation.city.realm)}/${consultation.cityId}/consultation/${consultation.id}`;
                await sendConsultationCommentEmail({
                    userName: user.name || 'Unknown User',
                    userEmail: user.email,
                    consultationTitle: regulationData.title || 'Consultation',
                    entityType: display.type,
                    entityId,
                    entityLabel: entityLabel(display),
                    commentBody: bodyHtml,
                    consultationUrl,
                    municipalityEmail: regulationData.contactEmail,
                    ccEmails: regulationData.ccEmails
                });
            }
        } catch (emailError) {
            // Log email error but don't fail the comment creation
            console.error('Failed to send comment notification email:', emailError);
        }
    }
}

/** Stores a signed-out reader's comment until they confirm it; clears the ones nobody confirmed in time. */
export async function createPendingConsultationComment(data: {
    userId: string;
    consultationId: string;
    cityId: string;
    entityType: ConsultationCommentEntityType;
    entityId: string;
    bodyHtml: string;
    authorName: string | null;
}, now: Date = new Date()) {
    await prisma.pendingConsultationComment.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - PENDING_COMMENT_MAX_AGE_MS) } }
    });
    return prisma.pendingConsultationComment.create({
        data: {
            userId: data.userId,
            consultationId: data.consultationId,
            cityId: data.cityId,
            entityType: data.entityType,
            entityId: data.entityId,
            body: data.bodyHtml,
            authorName: data.authorName
        }
    });
}

/** The id of the pending comment a confirmation link publishes, from the link's `callbackUrl`. */
export function pendingCommentIdFromMagicLink(magicLinkUrl: string): string | null {
    try {
        const callbackUrl = new URL(magicLinkUrl).searchParams.get('callbackUrl');
        return callbackUrl ? new URL(callbackUrl, 'https://opencouncil.invalid').searchParams.get('pending') : null;
    } catch {
        return null;
    }
}

/**
 * The text of the comment a confirmation link publishes, for the email that carries the link, so
 * the reader sees what they confirm. Only a comment of the account the email goes to is quoted.
 */
export async function pendingCommentQuote(magicLinkUrl: string, email: string): Promise<string | null> {
    const pendingId = pendingCommentIdFromMagicLink(magicLinkUrl);
    if (!pendingId) return null;
    const row = await prisma.pendingConsultationComment.findUnique({
        where: { id: pendingId },
        select: { body: true, user: { select: { email: true } } }
    });
    if (!row || row.user.email?.toLowerCase() !== email.toLowerCase()) return null;
    return commentHtmlToPlainText(row.body);
}

/**
 * Publishes the pending comment a confirmation link names, when the signed-in reader is its author.
 * Only that link publishes it: a sign-in by any other route does not, so nobody can publish a
 * comment in someone else's name by typing their email. A comment whose link expired, on a
 * consultation an administrator closed, or on a place the regulation no longer has is dropped. One
 * whose regulation cannot be fetched stays pending, so opening the link again retries.
 */
export async function confirmPendingConsultationComment(pendingId: string, userId: string, now: Date = new Date()): Promise<PendingCommentConfirmation> {
    const row = await prisma.pendingConsultationComment.findUnique({
        where: { id: pendingId },
        include: { consultation: { include: { city: { select: { realm: true } } } } }
    });
    if (!row || row.userId !== userId) return 'not-found';

    if (now.getTime() - row.createdAt.getTime() > PENDING_COMMENT_MAX_AGE_MS || !row.consultation.isActive) {
        await prisma.pendingConsultationComment.deleteMany({ where: { id: row.id } });
        return 'expired';
    }

    const regulationData = await fetchRegulationData(row.consultation.jsonUrl);
    if (!regulationData) return 'unavailable';
    if (!regulationHasEntity(regulationData, row.entityType, row.entityId)) {
        await prisma.pendingConsultationComment.deleteMany({ where: { id: row.id } });
        return 'not-found';
    }

    // The name the reader typed goes on the account before the municipality's email names them.
    const authorName = row.authorName?.trim();
    if (authorName) {
        await prisma.user.updateMany({
            where: { id: userId, OR: [{ name: null }, { name: '' }] },
            data: { name: authorName }
        });
    }

    const input: PublishCommentInput = {
        consultation: row.consultation,
        regulationData,
        userId,
        entityType: row.entityType,
        entityId: row.entityId,
        bodyHtml: row.body,
        createdAt: row.createdAt,
        notify: true
    };
    // Claiming the row and storing the comment commit together: a failed insert leaves the
    // comment pending, and of two openings of the link at once only the one that deletes the row publishes it.
    const comment = await prisma.$transaction(async (tx) => {
        const claimed = await tx.pendingConsultationComment.deleteMany({ where: { id: row.id } });
        if (claimed.count === 0) return null;
        return tx.consultationComment.create({ data: commentData(input) });
    });
    if (!comment) return 'not-found';

    await notifyMunicipality(input);
    return 'published';
}
