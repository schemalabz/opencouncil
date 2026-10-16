// The shared Prisma shapes of the document sends (#874): the selects of the
// queries in src/lib/db/documentSends.ts and the types derived from them.
import type { DocumentSendStatus, DocumentSendTrigger, Prisma } from '@prisma/client';
import { DECISION_ELIGIBLE_SUBJECT_WHERE, RECORD_SUBJECT_WHERE } from '../decisionEligibility';
import { publicAdministrativeBodyRelation, type AdministrativeBodyWithSettings } from './administrativeBody';

export const documentSendSettingSelect = {
    kind: true,
    enabled: true,
    enabledAt: true,
    recipientEmails: true,
} satisfies Prisma.DocumentSendSettingSelect;

export type DocumentSendSettingRow = Prisma.DocumentSendSettingGetPayload<{ select: typeof documentSendSettingSelect }>;

export const documentSendSummarySelect = {
    id: true,
    kind: true,
    status: true,
    trigger: true,
    recipientEmails: true,
    sentAt: true,
    failureReason: true,
    createdAt: true,
    _count: { select: { missingSubjects: true } },
} satisfies Prisma.DocumentSendSelect;

/** One send as the admin pages show it. */
export type DocumentSendSummary = Prisma.DocumentSendGetPayload<{ select: typeof documentSendSummarySelect }>;

/**
 * A send that holds the one automatic slot of its meeting and document, or
 * blocks an automatic send: any send that did not fail. The partial unique
 * index in the migration is the SQL form for the automatic sends; keep the
 * three in step.
 */
export const DOCUMENT_SLOT_TAKEN_WHERE = { status: { not: 'failed' } } satisfies Prisma.DocumentSendWhereInput;

/** `DOCUMENT_SLOT_TAKEN_WHERE` in memory. */
export function takesSlot(send: { status: DocumentSendStatus }): boolean {
    return send.status !== 'failed';
}

/** A send nobody asked for by hand: it competes for the automatic slot. */
export function isAutomaticSend(send: { trigger: DocumentSendTrigger }): boolean {
    return send.trigger !== 'manual';
}

/** The subjects a send went out without; none for a complete document. */
export function missingCountOf(send: { _count: { missingSubjects: number } }): number {
    return send._count.missingSubjects;
}

/** The latest send that went out of each document, keyed by meeting id. */
export type MeetingSentDocuments = Record<string, DocumentSendSummary[]>;

// The payload builders read the name of the body, never its settings.
export const documentMeetingInclude = {
    administrativeBody: publicAdministrativeBodyRelation,
    city: true,
} satisfies Prisma.CouncilMeetingInclude;

/** The meeting as the document payload builders read it. */
export type DocumentMeeting = Prisma.CouncilMeetingGetPayload<{ include: typeof documentMeetingInclude }>;

/** The name a document gives the body: its own, or the municipality's for a meeting with no body. */
export function documentBodyName(meeting: Pick<DocumentMeeting, 'administrativeBody' | 'city'>): string {
    return meeting.administrativeBody?.name || meeting.city.name_municipality;
}

export type DocumentSendClaim = Pick<
    Prisma.DocumentSendUncheckedCreateInput,
    'cityId' | 'councilMeetingId' | 'kind' | 'trigger' | 'recipientEmails' | 'createdById'
> & { missingSubjectIds: string[] };

/**
 * The task rows the readiness rule reads: the reviews and summaries that
 * succeeded, and the decision polls that ended. Newest first.
 */
const readinessTaskWhere = {
    OR: [
        { type: { in: ['humanReview', 'summarize'] }, status: 'succeeded' },
        { type: 'pollDecisions', status: { in: ['succeeded', 'failed'] } },
    ],
} satisfies Prisma.TaskStatusWhereInput;

export const readinessMeetingSelect = {
    id: true,
    cityId: true,
    dateTime: true,
    scheduleStatus: true,
    continuationOfId: true,
    kind: true,
    continuationOf: { select: { kind: true } },
    city: { select: { timezone: true, status: true, diavgeiaUid: true } },
    administrativeBodyId: true,
    administrativeBody: { select: { documentSendSettings: { select: documentSendSettingSelect } } },
    taskStatuses: {
        where: readinessTaskWhere,
        select: { type: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' as const },
    },
    subjects: { where: DECISION_ELIGIBLE_SUBJECT_WHERE, select: { id: true, decision: { select: { id: true } } } },
    documentSends: { select: documentSendSummarySelect, orderBy: { createdAt: 'desc' as const } },
    _count: { select: { subjects: { where: RECORD_SUBJECT_WHERE } } },
} satisfies Prisma.CouncilMeetingSelect;

/** Everything the readiness rules read about one meeting, in one query. */
export type ReadinessFacts = Prisma.CouncilMeetingGetPayload<{ select: typeof readinessMeetingSelect }>;

/**
 * Where the previous page ended. The candidates are in order of date, city
 * and id: a meeting id is unique only within its city.
 */
export type CandidateCursor = { dateTime: Date; cityId: string; id: string };

export const administrativeBodyWithSendSettingsInclude = {
    documentSendSettings: { select: documentSendSettingSelect },
} satisfies Prisma.AdministrativeBodyInclude;

/** A body with its "Αποστολή Εγγράφων" settings, as the body form edits it. */
export type AdministrativeBodyWithSendSettings = Omit<
    Prisma.AdministrativeBodyGetPayload<{ include: typeof administrativeBodyWithSendSettingsInclude }>,
    'decisionConventions'
> & Pick<AdministrativeBodyWithSettings, 'decisionConventions'>;
