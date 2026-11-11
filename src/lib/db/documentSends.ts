// The document send settings of a body and the record of each send (#874).
// Callers authorize: the body routes gate on editing rights, and the sender
// runs from the cron with no user session.
import "server-only";
import { DocumentKind, Prisma } from '@prisma/client';
import prisma from './prisma';
import { lockKey } from './advisoryLock';
import { TAKES_PLACE_WHERE } from '@/lib/meetingLifecycleRules';
import { CLAIM_REPLAY_AFTER_MS, RESULT_PERSISTING_STAGE } from '@/lib/tasks/resultStage';
import { staleBefore } from '@/lib/documents/settings';
import type { DocumentSendSettingInput } from '@/lib/zod-schemas/administrativeBody';
import {
    documentSendSettingSelect,
    type DocumentSendSettingRow,
    documentMeetingInclude,
    type DocumentMeeting,
    type DocumentSendClaim,
    DOCUMENT_SLOT_TAKEN_WHERE,
    readinessMeetingSelect,
    type ReadinessFacts,
    type CandidateCursor,
    documentSendSummarySelect,
    type MeetingSentDocuments,
} from './types/documentSend';

/** The setting of one document of a body, or null when the body has none. */
export async function getDocumentSendSetting(
    administrativeBodyId: string | null,
    kind: DocumentKind,
): Promise<DocumentSendSettingRow | null> {
    if (!administrativeBodyId) return null;
    return prisma.documentSendSetting.findUnique({
        where: { administrativeBodyId_kind: { administrativeBodyId, kind } },
        select: documentSendSettingSelect,
    });
}

/**
 * Write the settings of a body, one row per document in the input, inside the
 * caller's transaction: the body form saves the body and its settings as one.
 * A document that is switched on now gets enabledAt = now, so the switch
 * never emails the archive; a document that stays on keeps its enabledAt, and
 * a document that is switched off keeps it too, for the record.
 */
export async function replaceDocumentSendSettings(
    tx: Prisma.TransactionClient,
    administrativeBodyId: string,
    settings: DocumentSendSettingInput[],
): Promise<void> {
    const now = new Date();
    const existing = await tx.documentSendSetting.findMany({
        where: { administrativeBodyId },
        select: { kind: true, enabled: true },
    });
    const wasEnabled = new Map(existing.map(row => [row.kind, row.enabled]));
    for (const { kind, enabled, recipientEmails } of settings) {
        const switchedOn = enabled && !wasEnabled.get(kind);
        await tx.documentSendSetting.upsert({
            where: { administrativeBodyId_kind: { administrativeBodyId, kind } },
            create: { administrativeBodyId, kind, enabled, recipientEmails, enabledAt: now },
            update: { enabled, recipientEmails, ...(switchedOn ? { enabledAt: now } : {}) },
        });
    }
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
export async function claimDocumentSend({ missingSubjectIds, ...claim }: DocumentSendClaim): Promise<{ id: string } | 'taken'> {
    try {
        return await prisma.$transaction(async (tx) => {
            await lockKey(tx, `documentSend:${claim.cityId}:${claim.councilMeetingId}:${claim.kind}`);
            if (claim.trigger !== 'manual') {
                const existing = await tx.documentSend.findFirst({
                    where: { cityId: claim.cityId, councilMeetingId: claim.councilMeetingId, kind: claim.kind, ...DOCUMENT_SLOT_TAKEN_WHERE },
                    select: { id: true },
                });
                if (existing) return 'taken' as const;
            }
            return tx.documentSend.create({
                data: {
                    ...claim,
                    status: 'pending',
                    missingSubjects: { create: missingSubjectIds.map(subjectId => ({ subjectId })) },
                },
                select: { id: true },
            });
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

/**
 * Whether a task of the meeting is writing what the documents render now. A
 * decision poll links the decisions first and writes their excerpts, votes
 * and attendance after: it holds while it persists, for as long as a replay
 * leaves its claim alone (CLAIM_REPLAY_AFTER_MS). A summarize run after an
 * earlier one rewrites the subjects outside the agenda and the discussion
 * tags: it holds while it reported in the last STALE_PENDING_MINUTES. The
 * minutes wait for the first summarize through the readiness rule itself.
 */
export async function isMeetingBeingWritten(cityId: string, meetingId: string, now: Date = new Date()): Promise<boolean> {
    const writing = await prisma.taskStatus.findFirst({
        where: {
            cityId,
            councilMeetingId: meetingId,
            status: { notIn: ['succeeded', 'failed'] },
            OR: [
                { type: 'pollDecisions', stage: RESULT_PERSISTING_STAGE, updatedAt: { gte: new Date(now.getTime() - CLAIM_REPLAY_AFTER_MS) } },
                { type: 'summarize', updatedAt: { gte: staleBefore(now) } },
            ],
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
        where: { status: 'pending', createdAt: { lt: staleBefore(now) } },
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
    kind: DocumentKind,
    now: Date = new Date(),
    after: CandidateCursor | null = null,
): Promise<ReadinessFacts[]> {
    return prisma.councilMeeting.findMany({
        where: {
            ...TAKES_PLACE_WHERE,
            continuationOfId: null,
            dateTime: { gte: new Date(now.getTime() - DOCUMENT_SEND_WINDOW_DAYS * 24 * 60 * 60 * 1000), lte: now },
            administrativeBody: { documentSendSettings: { some: { kind, enabled: true } } },
            taskStatuses: { some: { type: 'humanReview', status: 'succeeded' } },
            documentSends: { none: { kind, ...DOCUMENT_SLOT_TAKEN_WHERE } },
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

/**
 * The latest send that went out of each document of every meeting of a city,
 * keyed by meeting id. The admin list marks the documents that went out.
 */
export async function getSentDocumentsForCity(cityId: string): Promise<MeetingSentDocuments> {
    const sends = await prisma.documentSend.findMany({
        where: { cityId, status: 'sent' },
        select: { ...documentSendSummarySelect, councilMeetingId: true },
        orderBy: { createdAt: 'desc' },
    });
    const byMeeting: MeetingSentDocuments = {};
    for (const { councilMeetingId, ...send } of sends) {
        const ofMeeting = (byMeeting[councilMeetingId] ??= []);
        if (!ofMeeting.some(earlier => earlier.kind === send.kind)) ofMeeting.push(send);
    }
    return byMeeting;
}
