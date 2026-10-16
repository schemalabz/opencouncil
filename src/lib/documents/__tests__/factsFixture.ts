// Shared fixtures of the document send tests: the facts of one meeting as
// getReadinessFacts returns them, and one send as the admin pages read it.
import type { DocumentKind } from '@prisma/client';
import type { DocumentSendSettingRow, DocumentSendSummary, ReadinessFacts } from '@/lib/db/types';

export const meetingDate = new Date('2026-03-10T17:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
export const daysAfter = (days: number) => new Date(meetingDate.getTime() + days * DAY_MS);
/** 10 Mar 2026, 19:00 in Athens: due at the start of 15 Mar, Athens time (UTC+2 before the 29 Mar change). */
export const minutesDueAtFixture = new Date('2026-03-14T22:00:00Z');

/** A setting switched on well before the meeting. */
export function setting(kind: DocumentKind, overrides: Partial<DocumentSendSettingRow> = {}): DocumentSendSettingRow {
    return { kind, enabled: true, enabledAt: new Date('2026-01-01T00:00:00Z'), recipientEmails: ['clerk@example.org'], ...overrides };
}

type TaskRow = ReadinessFacts['taskStatuses'][number];

export function task(type: string, at: Date, status = 'succeeded'): TaskRow {
    return { type, status, createdAt: at, updatedAt: at };
}

export const reviewTask = task('humanReview', daysAfter(1));
export const summarizeTask = task('summarize', daysAfter(1));

export function documentSend(overrides: Partial<DocumentSendSummary> = {}): DocumentSendSummary {
    return {
        id: 'send-1',
        kind: 'minutes',
        status: 'sent',
        trigger: 'complete',
        recipientEmails: ['clerk@example.org'],
        sentAt: daysAfter(2),
        failureReason: null,
        createdAt: daysAfter(2),
        _count: { missingSubjects: 0 },
        ...overrides,
    };
}

/**
 * A reviewed and summarized ordinary meeting of a body that sends both
 * documents, in a city that the cron does not poll (no diavgeiaUid), with one
 * subject decided and one not.
 */
export function readinessFacts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
    return {
        id: 'm1',
        cityId: 'c1',
        dateTime: meetingDate,
        scheduleStatus: 'scheduled',
        continuationOfId: null,
        kind: 'ordinary',
        continuationOf: null,
        city: { timezone: 'Europe/Athens', status: 'supported', diavgeiaUid: null },
        administrativeBodyId: 'b1',
        administrativeBody: { documentSendSettings: [setting('transcript'), setting('minutes')] },
        taskStatuses: [summarizeTask, reviewTask],
        subjects: [{ id: 's1', decision: { id: 'd1' } }, { id: 's2', decision: null }],
        _count: { subjects: 2 },
        documentSends: [],
        ...overrides,
    };
}
