// The document send settings of a body and the record of each send (#874).
// Callers authorize: the body routes gate on editing rights, and the sender
// runs from the cron with no user session.
import "server-only";
import { DocumentKind, Prisma } from '@prisma/client';
import prisma from './prisma';
import {
    documentSendSettingSelect,
    type DocumentSendSettingRow,
    documentSendSummarySelect,
    type DocumentSendSummary,
    documentMeetingInclude,
    type DocumentMeeting,
    type DocumentSendClaim,
} from './types/documentSend';

/** The settings of a body, one per document that has a row. */
export async function getDocumentSendSettings(administrativeBodyId: string): Promise<DocumentSendSettingRow[]> {
    return prisma.documentSendSetting.findMany({
        where: { administrativeBodyId },
        select: documentSendSettingSelect,
    });
}

/** The setting of one document of a body, or null when the body has none. */
export async function getDocumentSendSetting(
    administrativeBodyId: string | null,
    document: DocumentKind,
): Promise<DocumentSendSettingRow | null> {
    if (!administrativeBodyId) return null;
    return prisma.documentSendSetting.findUnique({
        where: { administrativeBodyId_document: { administrativeBodyId, document } },
        select: documentSendSettingSelect,
    });
}

/** The sends of every meeting of a city, newest first, keyed by meeting id. */
export async function getDocumentSendsForCity(cityId: string): Promise<Record<string, DocumentSendSummary[]>> {
    const sends = await prisma.documentSend.findMany({
        where: { cityId },
        select: { ...documentSendSummarySelect, councilMeetingId: true },
        orderBy: { createdAt: 'desc' },
    });
    const byMeeting: Record<string, DocumentSendSummary[]> = {};
    for (const { councilMeetingId, ...send } of sends) {
        (byMeeting[councilMeetingId] ??= []).push(send);
    }
    return byMeeting;
}

export async function getMeetingForDocumentSend(cityId: string, meetingId: string): Promise<DocumentMeeting | null> {
    return prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        include: documentMeetingInclude,
    });
}

/**
 * Claim a send: insert its pending row. An automatic claim is 'taken' when a
 * send of the same meeting and document is pending or sent, automatic or by
 * hand; the caller then sends nothing. A manual claim always inserts: a send
 * by hand may repeat.
 *
 * Every claim of one meeting and document holds the same transaction lock, so
 * an automatic claim sees a manual claim that committed just before it. The
 * partial unique index stays as the guard between two automatic claims.
 */
export async function claimDocumentSend(claim: DocumentSendClaim): Promise<{ id: string } | 'taken'> {
    try {
        return await prisma.$transaction(async (tx) => {
            const lockKey = `documentSend:${claim.cityId}:${claim.councilMeetingId}:${claim.document}`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
            if (claim.automatic) {
                const existing = await tx.documentSend.findFirst({
                    where: { cityId: claim.cityId, councilMeetingId: claim.councilMeetingId, document: claim.document, status: { not: 'failed' } },
                    select: { id: true },
                });
                if (existing) return 'taken' as const;
            }
            return tx.documentSend.create({ data: { ...claim, status: 'pending' }, select: { id: true } });
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return 'taken';
        }
        throw error;
    }
}

/**
 * Mark a claim as handed to the email provider, right before the email goes
 * out. False when the cron released the claim as stale meanwhile: then the
 * sender must not email. A claim that stays `sending` is never released, so
 * an email that went out without its record is never sent again on its own.
 */
export async function markDocumentSending(id: string): Promise<boolean> {
    const result = await prisma.documentSend.updateMany({ where: { id, status: 'pending' }, data: { status: 'sending' } });
    return result.count > 0;
}

/** Record how a claimed send ended. */
export async function settleDocumentSend(
    id: string,
    outcome: { status: 'sent'; sentAt: Date } | { status: 'failed'; failureReason: string },
): Promise<boolean> {
    // Only a claim that is not settled yet: a claim the cron released as
    // stale must not turn sent beside the newer claim that took its slot.
    const result = await prisma.documentSend.updateMany({ where: { id, status: { in: ['pending', 'sending'] } }, data: outcome });
    return result.count > 0;
}
