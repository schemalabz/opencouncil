import type { ReadinessFacts, DocumentSendSummary } from '@/lib/db/types';
import { documentState } from '../status';

const meetingDate = new Date('2026-03-10T17:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAfter = (days: number) => new Date(meetingDate.getTime() + days * DAY_MS);

const setting = (document: 'transcript' | 'minutes', enabled = true) => ({ document, enabled, enabledAt: null, recipientEmails: ['clerk@example.org'] });

function send(overrides: Partial<DocumentSendSummary>): DocumentSendSummary {
    return {
        id: 'send-1',
        document: 'minutes',
        status: 'sent',
        trigger: 'complete',
        automatic: true,
        recipientEmails: ['clerk@example.org'],
        complete: true,
        missingSubjectIds: [],
        sentAt: daysAfter(2),
        failureReason: null,
        createdAt: daysAfter(2),
        ...overrides,
    };
}

function facts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
    return {
        id: 'm1',
        cityId: 'c1',
        dateTime: meetingDate,
        scheduleStatus: 'scheduled',
        continuationOfId: null,
        kind: 'ordinary',
        continuationOf: null,
        city: { timezone: 'Europe/Athens' },
        administrativeBodyId: 'b1',
        administrativeBody: { documentSendSettings: [setting('transcript'), setting('minutes')] },
        taskStatuses: [{ id: 'review' }],
        subjects: [{ id: 's1', decision: { id: 'd1' } }, { id: 's2', decision: null }],
        _count: { subjects: 2 },
        documentSends: [],
        ...overrides,
    };
}

describe('documentState', () => {
    it('reads a complete send as sent, with its recipients, time and trigger', () => {
        const state = documentState(facts({ documentSends: [send({ trigger: 'review', document: 'transcript', recipientEmails: ['a@example.org', 'b@example.org'] })] }), 'transcript', daysAfter(3));
        expect(state).toMatchObject({ state: 'sent', trigger: 'review', recipientEmails: ['a@example.org', 'b@example.org'], sentAt: daysAfter(2) });
    });

    it('reads an incomplete send with the count of the subjects it lacked', () => {
        const state = documentState(facts({ documentSends: [send({ complete: false, missingSubjectIds: ['s2', 's3'], trigger: 'threshold' })] }), 'minutes', daysAfter(12));
        expect(state).toMatchObject({ state: 'sentIncomplete', missingCount: 2, trigger: 'threshold' });
    });

    it('lets a later complete send by hand replace an incomplete one', () => {
        const sends = [
            send({ id: 'a', complete: false, missingSubjectIds: ['s2'], createdAt: daysAfter(10) }),
            send({ id: 'b', complete: true, trigger: 'manual', automatic: false, createdAt: daysAfter(15), sentAt: daysAfter(15) }),
        ];
        expect(documentState(facts({ documentSends: sends }), 'minutes', daysAfter(16))).toMatchObject({ state: 'sent', trigger: 'manual' });
    });

    it('reads a failed send as failed, with its reason, until a send succeeds', () => {
        const failed = send({ status: 'failed', failureReason: 'stale', sentAt: null });
        expect(documentState(facts({ documentSends: [failed] }), 'minutes', daysAfter(3))).toMatchObject({ state: 'failed', failureReason: 'stale' });
        expect(documentState(facts({ documentSends: [failed, send({ id: 'ok', createdAt: daysAfter(4) })] }), 'minutes', daysAfter(5)).state).toBe('sent');
    });

    it('shows a failed resend as failed, and keeps the earlier delivery', () => {
        const delivered = send({ id: 'first', createdAt: daysAfter(4), sentAt: daysAfter(4) });
        const resend = send({ id: 'again', status: 'failed', failureReason: 'rate limited', trigger: 'manual', automatic: false, sentAt: null, createdAt: daysAfter(6) });

        expect(documentState(facts({ documentSends: [delivered, resend] }), 'minutes', daysAfter(7))).toMatchObject({ state: 'failed', failureReason: 'rate limited', earlierSentAt: daysAfter(4) });
        // The delivery alone carries no earlier send
        expect(documentState(facts({ documentSends: [delivered] }), 'minutes', daysAfter(7)).earlierSentAt).toBeNull();
    });

    it('reads a claim in flight as pending, and one handed over too long ago as unconfirmed', () => {
        expect(documentState(facts({ documentSends: [send({ status: 'pending', sentAt: null })] }), 'minutes', daysAfter(3)).state).toBe('pending');
        // Handed to the provider: in progress for a while, then unconfirmed, because it may have gone out
        const handedOver = send({ status: 'sending', sentAt: null, createdAt: daysAfter(3) });
        expect(documentState(facts({ documentSends: [handedOver] }), 'minutes', new Date(daysAfter(3).getTime() + 60_000)).state).toBe('pending');
        expect(documentState(facts({ documentSends: [handedOver] }), 'minutes', daysAfter(4)).state).toBe('unconfirmed');
    });

    it('waits for the decisions before the threshold, and says until when', () => {
        expect(documentState(facts(), 'minutes', daysAfter(3))).toMatchObject({ state: 'waiting', waitReason: 'decisions', dueAt: new Date('2026-03-14T22:00:00Z') });
    });

    it('waits for the agenda of a reviewed meeting with none', () => {
        expect(documentState(facts({ subjects: [], _count: { subjects: 0 } }), 'minutes', daysAfter(3))).toMatchObject({ state: 'waiting', waitReason: 'agenda' });
    });

    it('reads the minutes as unsent once the threshold passed and nothing went out', () => {
        expect(documentState(facts(), 'minutes', daysAfter(11))).toMatchObject({ state: 'unsent', missingCount: 1 });
    });

    it('waits for the review', () => {
        expect(documentState(facts({ taskStatuses: [] }), 'minutes', daysAfter(1))).toMatchObject({ state: 'waiting', waitReason: 'review' });
    });

    it('reads a document the body does not send as not enabled', () => {
        const off = facts({ administrativeBody: { documentSendSettings: [setting('minutes', false)] } });
        expect(documentState(off, 'minutes', daysAfter(20))).toMatchObject({ state: 'notEnabled', recipientEmails: [] });
        expect(documentState(facts({ administrativeBody: null, administrativeBodyId: null }), 'minutes', daysAfter(1)).state).toBe('notEnabled');
    });

    it('offers the minutes of a meeting held before the switch-on by hand only', () => {
        const later = { ...setting('minutes'), enabledAt: daysAfter(5) };
        const older = facts({ administrativeBody: { documentSendSettings: [setting('transcript'), later] } });
        expect(documentState(older, 'minutes', daysAfter(20)).state).toBe('byHandOnly');
    });
});
