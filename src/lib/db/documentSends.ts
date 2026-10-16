// The document send settings of a body and the record of each send (#874).
// Callers authorize: the body routes gate on editing rights, and the sender
// runs from the cron with no user session.
import "server-only";
import { DocumentKind, Prisma } from '@prisma/client';
import prisma from './prisma';
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from './decisionEligibility';
import { TAKES_PLACE_WHERE } from '@/lib/meetingLifecycleRules';
import type { DocumentSendRule } from '@/lib/documents/settings';

export const documentSendSettingSelect = {
    document: true,
    enabled: true,
    enabledAt: true,
    recipientEmails: true,
} satisfies Prisma.DocumentSendSettingSelect;

export type DocumentSendSettingRow = Prisma.DocumentSendSettingGetPayload<{ select: typeof documentSendSettingSelect }>;

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

export const documentSendSummarySelect = {
    id: true,
    document: true,
    status: true,
    trigger: true,
    automatic: true,
    recipientEmails: true,
    complete: true,
    missingSubjectIds: true,
    sentAt: true,
    failureReason: true,
    createdAt: true,
} satisfies Prisma.DocumentSendSelect;

/** One send as the admin pages show it. */
export type DocumentSendSummary = Prisma.DocumentSendGetPayload<{ select: typeof documentSendSummarySelect }>;

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

/** The meeting as the document payload builders read it. */
export type DocumentMeeting = Prisma.CouncilMeetingGetPayload<{ include: { city: true; administrativeBody: true } }>;

export async function getMeetingForDocumentSend(cityId: string, meetingId: string): Promise<DocumentMeeting | null> {
    return prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        include: { administrativeBody: true, city: true },
    });
}

export type DocumentSendClaim = Pick<
    Prisma.DocumentSendUncheckedCreateInput,
    'cityId' | 'councilMeetingId' | 'document' | 'trigger' | 'automatic' | 'recipientEmails' | 'complete' | 'missingSubjectIds'
>;

/**
 * Claim a send: insert its pending row. An automatic claim fails on the
 * partial unique index when another automatic row of the same meeting and
 * document is pending or sent; that is the one guard against a double send,
 * and the caller then sends nothing.
 */
export async function claimDocumentSend(claim: DocumentSendClaim): Promise<{ id: string } | 'taken'> {
    try {
        return await prisma.documentSend.create({ data: { ...claim, status: 'pending' }, select: { id: true } });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return 'taken';
        }
        throw error;
    }
}

/** Record how a claimed send ended. */
export async function settleDocumentSend(
    id: string,
    outcome: { status: 'sent'; sentAt: Date } | { status: 'failed'; failureReason: string },
): Promise<boolean> {
    // Only a claim that is still pending: a claim the cron released as stale
    // must not turn sent beside the newer claim that took its slot.
    const result = await prisma.documentSend.updateMany({ where: { id, status: 'pending' }, data: outcome });
    return result.count > 0;
}

/** How long a pending claim may stand before the cron treats its sender as dead. */
export const STALE_PENDING_MINUTES = 30;

/**
 * Release the claims whose sender died: a pending row older than
 * STALE_PENDING_MINUTES becomes failed, which frees the automatic slot of the
 * unique index for the next run. Returns how many it released.
 */
export async function failStaleDocumentSends(now: Date = new Date()): Promise<number> {
    const result = await prisma.documentSend.updateMany({
        where: { status: 'pending', createdAt: { lt: new Date(now.getTime() - STALE_PENDING_MINUTES * 60 * 1000) } },
        data: { status: 'failed', failureReason: 'stale' },
    });
    return result.count;
}

export const readinessMeetingSelect = {
    id: true,
    cityId: true,
    dateTime: true,
    scheduleStatus: true,
    continuationOfId: true,
    kind: true,
    continuationOf: { select: { kind: true } },
    city: { select: { timezone: true } },
    administrativeBodyId: true,
    administrativeBody: { select: { documentSendSettings: { select: documentSendSettingSelect } } },
    taskStatuses: { where: { type: 'humanReview', status: 'succeeded' }, select: { id: true }, take: 1 },
    subjects: { where: DECISION_ELIGIBLE_SUBJECT_WHERE, select: { id: true, decision: { select: { id: true } } } },
    documentSends: { select: { document: true, status: true, automatic: true } },
} satisfies Prisma.CouncilMeetingSelect;

/** Everything the readiness rules read about one meeting, in one query. */
export type ReadinessFacts = Prisma.CouncilMeetingGetPayload<{ select: typeof readinessMeetingSelect }>;

export async function getReadinessFacts(cityId: string, meetingId: string): Promise<ReadinessFacts | null> {
    return prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: readinessMeetingSelect,
    });
}

/** The cron looks this far back. The review hook covers a meeting reviewed later than this. */
export const DOCUMENT_SEND_WINDOW_DAYS = 120;

/**
 * The meetings the cron evaluates for one document: held, reviewed, a first
 * part, in the window, of a body with the document switched on, and with no
 * send of that document pending or sent, automatic or by hand. Oldest first, so the most
 * overdue meeting goes out first when the batch is full.
 */
export async function findDocumentSendCandidates(document: DocumentKind, now: Date = new Date()): Promise<ReadinessFacts[]> {
    return prisma.councilMeeting.findMany({
        where: {
            ...TAKES_PLACE_WHERE,
            continuationOfId: null,
            dateTime: { gte: new Date(now.getTime() - DOCUMENT_SEND_WINDOW_DAYS * 24 * 60 * 60 * 1000), lte: now },
            administrativeBody: { documentSendSettings: { some: { document, enabled: true } } },
            taskStatuses: { some: { type: 'humanReview', status: 'succeeded' } },
            documentSends: { none: { document, status: { not: 'failed' } } },
        },
        select: readinessMeetingSelect,
        orderBy: { dateTime: 'asc' },
        take: 200,
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
