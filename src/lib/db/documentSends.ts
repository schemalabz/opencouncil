// The document send settings of a body and the record of each send (#874).
// Callers authorize: the body routes gate on editing rights, and the sender
// runs from the cron with no user session.
import "server-only";
import { DocumentKind, Prisma } from '@prisma/client';
import prisma from './prisma';
import { TAKES_PLACE_WHERE } from '@/lib/meetingLifecycleRules';
import { RESULT_PERSISTING_STAGE } from '@/lib/tasks/resultStage';
import { STALE_PENDING_MINUTES, type DocumentSendRule } from '@/lib/documents/settings';
import {
    documentSendSettingSelect,
    type DocumentSendSettingRow,
    documentSendSummarySelect,
    type DocumentSendSummary,
    documentMeetingInclude,
    type DocumentMeeting,
    type DocumentSendClaim,
    readinessMeetingSelect,
    type ReadinessFacts,
    type CandidateCursor,
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

/**
 * Write the settings of a body, one row per document in the input. A document
 * that is switched on now gets enabledAt = now, so the switch never emails the
 * archive; a document that stays on keeps its enabledAt, and a document that
 * is switched off keeps it too, for the record.
 */
export async function replaceDocumentSendSettings(
    administrativeBodyId: string,
    settings: Array<Pick<DocumentSendRule, 'enabled' | 'recipientEmails'> & { document: DocumentKind }>,
): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
        const existing = await tx.documentSendSetting.findMany({
            where: { administrativeBodyId },
            select: { document: true, enabled: true },
        });
        const wasEnabled = new Map(existing.map(row => [row.document, row.enabled]));
        for (const { document, enabled, recipientEmails } of settings) {
            const switchedOn = enabled && !wasEnabled.get(document);
            await tx.documentSendSetting.upsert({
                where: { administrativeBodyId_document: { administrativeBodyId, document } },
                create: { administrativeBodyId, document, enabled, recipientEmails, enabledAt: enabled ? now : null },
                update: { enabled, recipientEmails, ...(switchedOn ? { enabledAt: now } : {}) },
            });
        }
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

export { STALE_PENDING_MINUTES };

/**
 * Whether a decision poll of the meeting is writing its results now. The
 * poll links the decisions first and writes their excerpts, votes and
 * attendance after, so minutes rendered in between would lack them. A poll
 * that stopped writing more than STALE_PENDING_MINUTES ago died, and holds
 * nothing.
 */
export async function isDecisionPollWriting(cityId: string, meetingId: string): Promise<boolean> {
    const writing = await prisma.taskStatus.findFirst({
        where: {
            cityId,
            councilMeetingId: meetingId,
            type: 'pollDecisions',
            stage: RESULT_PERSISTING_STAGE,
            status: { notIn: ['succeeded', 'failed'] },
            updatedAt: { gte: new Date(Date.now() - STALE_PENDING_MINUTES * 60 * 1000) },
        },
        select: { id: true },
    });
    return writing !== null;
}

/**
 * Release the claims whose sender died before the email: a pending row older
 * than STALE_PENDING_MINUTES becomes failed, which frees the automatic slot of
 * the unique index for the next run. A sending row stays: its email may have
 * gone out. Returns how many it released.
 */
export async function failStaleDocumentSends(now: Date = new Date()): Promise<number> {
    const result = await prisma.documentSend.updateMany({
        where: { status: 'pending', createdAt: { lt: new Date(now.getTime() - STALE_PENDING_MINUTES * 60 * 1000) } },
        data: { status: 'failed', failureReason: 'stale' },
    });
    return result.count;
}

export async function getReadinessFacts(cityId: string, meetingId: string): Promise<ReadinessFacts | null> {
    return prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: readinessMeetingSelect,
    });
}

/** The cron looks this far back. The review hook covers a meeting reviewed later than this. */
export const DOCUMENT_SEND_WINDOW_DAYS = 120;

/** How many candidates one query reads. The cron reads the next page until its batch is full. */
export const CANDIDATE_PAGE_SIZE = 200;

/**
 * One page of the meetings the cron evaluates for one document: held,
 * reviewed, a first part, in the window, of a body with the document switched
 * on, and with no send of that document pending or sent, automatic or by
 * hand. Oldest first, so the most overdue meeting goes out first when the
 * batch is full.
 *
 * A page can hold meetings that never send (they wait, or their attempts are
 * used up), so the cron reads on past them with `after`.
 */
export async function findDocumentSendCandidates(
    document: DocumentKind,
    now: Date = new Date(),
    after: CandidateCursor | null = null,
): Promise<ReadinessFacts[]> {
    return prisma.councilMeeting.findMany({
        where: {
            ...TAKES_PLACE_WHERE,
            continuationOfId: null,
            dateTime: { gte: new Date(now.getTime() - DOCUMENT_SEND_WINDOW_DAYS * 24 * 60 * 60 * 1000), lte: now },
            administrativeBody: { documentSendSettings: { some: { document, enabled: true } } },
            taskStatuses: { some: { type: 'humanReview', status: 'succeeded' } },
            documentSends: { none: { document, status: { not: 'failed' } } },
            ...(after && {
                OR: [
                    { dateTime: { gt: after.dateTime } },
                    { dateTime: after.dateTime, cityId: { gt: after.cityId } },
                    { dateTime: after.dateTime, cityId: after.cityId, id: { gt: after.id } },
                ],
            }),
        },
        select: readinessMeetingSelect,
        orderBy: [{ dateTime: 'asc' }, { cityId: 'asc' }, { id: 'asc' }],
        take: CANDIDATE_PAGE_SIZE,
    });
}

/** The agenda index and the title of the given subjects, for the incomplete minutes email. */
export async function getSubjectLabels(subjectIds: string[]): Promise<Array<{ id: string; agendaItemIndex: number | null; name: string; agendaItemTitle: string | null }>> {
    if (subjectIds.length === 0) return [];
    return prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, agendaItemIndex: true, name: true, agendaItemTitle: true },
        orderBy: [{ agendaItemIndex: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    });
}
