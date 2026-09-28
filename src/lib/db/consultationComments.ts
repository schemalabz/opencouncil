import "server-only";
import { ConsultationCommentEntityType, type ConsultationComment, type Realm } from '@prisma/client';
import prisma from "./prisma";
import { env } from "@/env.mjs";
import { sendConsultationCommentEmail } from "../email/consultation";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";
import { describeEntity, entityLabel, extractGeoSets } from "@/components/consultations/entityDisplay";
import type { RegulationData } from "@/components/consultations/types";

/*
 * Publishing a consultation comment, and the comments that wait for their author to confirm an
 * email address. This module must not import "@/auth" (directly or through "@/lib/auth"): the
 * Auth.js sign-in event in src/auth.ts calls publishPendingConsultationComments.
 */

/** A pending comment older than this is dropped instead of published: a sign-in months later is not a confirmation. */
export const PENDING_COMMENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
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

export async function createPendingConsultationComment(data: {
    userId: string;
    consultationId: string;
    cityId: string;
    entityType: ConsultationCommentEntityType;
    entityId: string;
    bodyHtml: string;
    authorName: string | null;
}) {
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

/**
 * Publishes the comments a reader wrote before confirming their email. Called on every sign-in:
 * opening the magic link proves the address. A row older than PENDING_COMMENT_MAX_AGE_MS, on a
 * consultation an administrator closed, or on an entity the regulation no longer has is dropped.
 * A row whose regulation cannot be fetched stays pending for the next sign-in. Returns how many
 * comments were published.
 */
export async function publishPendingConsultationComments(userId: string, now: Date = new Date()): Promise<number> {
    const pending = await prisma.pendingConsultationComment.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: { consultation: { include: { city: { select: { realm: true } } } } }
    });
    if (pending.length === 0) return 0;

    const fresh = pending.filter(p => now.getTime() - p.createdAt.getTime() <= PENDING_COMMENT_MAX_AGE_MS && p.consultation.isActive);

    // The name the reader typed goes on the account before the municipality's email names them.
    const authorName = [...fresh].reverse().find(p => p.authorName?.trim())?.authorName?.trim();
    if (authorName) {
        await prisma.user.updateMany({
            where: { id: userId, OR: [{ name: null }, { name: '' }] },
            data: { name: authorName }
        });
    }

    const regulations = new Map<string, RegulationData | null>();
    let published = 0;
    for (const row of pending) {
        if (!fresh.includes(row)) {
            await prisma.pendingConsultationComment.deleteMany({ where: { id: row.id } });
            continue;
        }

        if (!regulations.has(row.consultation.jsonUrl)) {
            regulations.set(row.consultation.jsonUrl, await fetchRegulationData(row.consultation.jsonUrl));
        }
        const regulationData = regulations.get(row.consultation.jsonUrl);
        if (!regulationData) continue;
        if (!regulationHasEntity(regulationData, row.entityType, row.entityId)) {
            await prisma.pendingConsultationComment.deleteMany({ where: { id: row.id } });
            continue;
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
        // comment pending, and of two sign-ins at once only the one that deletes the row publishes it.
        const comment = await prisma.$transaction(async (tx) => {
            const claimed = await tx.pendingConsultationComment.deleteMany({ where: { id: row.id } });
            if (claimed.count === 0) return null;
            return tx.consultationComment.create({ data: commentData(input) });
        });
        if (!comment) continue;

        await notifyMunicipality(input);
        published++;
    }
    return published;
}
