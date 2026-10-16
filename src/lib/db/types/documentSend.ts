// The shared Prisma shapes of the document sends (#874): the selects of the
// queries in src/lib/db/documentSends.ts and the types derived from them.
import type { Prisma } from '@prisma/client';
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from '../decisionEligibility';
import { publicAdministrativeBodyRelation, type AdministrativeBodyWithSettings } from './administrativeBody';

export const documentSendSettingSelect = {
    document: true,
    enabled: true,
    enabledAt: true,
    recipientEmails: true,
} satisfies Prisma.DocumentSendSettingSelect;

export type DocumentSendSettingRow = Prisma.DocumentSendSettingGetPayload<{ select: typeof documentSendSettingSelect }>;

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

// The payload builders read the name of the body, never its settings.
export const documentMeetingInclude = {
    administrativeBody: publicAdministrativeBodyRelation,
    city: true,
} satisfies Prisma.CouncilMeetingInclude;

/** The meeting as the document payload builders read it. */
export type DocumentMeeting = Prisma.CouncilMeetingGetPayload<{ include: typeof documentMeetingInclude }>;

export type DocumentSendClaim = Pick<
    Prisma.DocumentSendUncheckedCreateInput,
    'cityId' | 'councilMeetingId' | 'document' | 'trigger' | 'automatic' | 'recipientEmails' | 'complete' | 'missingSubjectIds'
>;

/**
 * The subjects that make an agenda: those with an agenda position, and the
 * subjects out of the agenda. Unlike DECISION_ELIGIBLE_SUBJECT_WHERE it keeps
 * the withdrawn ones, which the minutes list too: an agenda whose every item
 * was withdrawn is still an agenda, with nothing left to decide.
 */
const AGENDA_SUBJECT_WHERE = { OR: DECISION_ELIGIBLE_SUBJECT_WHERE.OR } satisfies Prisma.SubjectWhereInput;

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
    _count: { select: { subjects: { where: AGENDA_SUBJECT_WHERE } } },
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
