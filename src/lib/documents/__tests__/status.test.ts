import type { ReadinessFacts, DocumentSendSummary } from '@/lib/db/types';
import { documentChip, documentChips, sendableDocumentChips, visibleDocumentChips } from '../status';
import { chipDetails } from '@/components/admin/documents/DocumentChips';
import { formatNumericDateTime } from '@/lib/formatters/time';

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

describe('documentChip', () => {
    it('reads a complete send as sent, with its recipients, time and trigger', () => {
        const chip = documentChip(facts({ documentSends: [send({ trigger: 'review', document: 'transcript', recipientEmails: ['a@example.org', 'b@example.org'] })] }), 'transcript', daysAfter(3));
        expect(chip).toMatchObject({ state: 'sent', trigger: 'review', recipientEmails: ['a@example.org', 'b@example.org'], sentAt: daysAfter(2), attention: false });
    });

    it('flags an incomplete send with the count of the subjects it lacked', () => {
        const chip = documentChip(facts({ documentSends: [send({ complete: false, missingSubjectIds: ['s2', 's3'], trigger: 'threshold' })] }), 'minutes', daysAfter(12));
        expect(chip).toMatchObject({ state: 'sentIncomplete', missingCount: 2, trigger: 'threshold', attention: true });
    });

    it('lets a later complete send by hand replace an incomplete one', () => {
        const sends = [
            send({ id: 'a', complete: false, missingSubjectIds: ['s2'], createdAt: daysAfter(10) }),
            send({ id: 'b', complete: true, trigger: 'manual', automatic: false, createdAt: daysAfter(15), sentAt: daysAfter(15) }),
        ];
        expect(documentChip(facts({ documentSends: sends }), 'minutes', daysAfter(16))).toMatchObject({ state: 'sent', trigger: 'manual', attention: false });
    });

    it('reads a failed send as failed, with its reason, until a send succeeds', () => {
        const failed = send({ status: 'failed', failureReason: 'stale', sentAt: null });
        expect(documentChip(facts({ documentSends: [failed] }), 'minutes', daysAfter(3))).toMatchObject({ state: 'failed', failureReason: 'stale', attention: true });
        expect(documentChip(facts({ documentSends: [failed, send({ id: 'ok', createdAt: daysAfter(4) })] }), 'minutes', daysAfter(5)).state).toBe('sent');
    });

    it('shows a failed resend as failed, with the earlier delivery in the details', () => {
        const delivered = send({ id: 'first', createdAt: daysAfter(4), sentAt: daysAfter(4) });
        const resend = send({ id: 'again', status: 'failed', failureReason: 'rate limited', trigger: 'manual', automatic: false, sentAt: null, createdAt: daysAfter(6) });

        const chip = documentChip(facts({ documentSends: [delivered, resend] }), 'minutes', daysAfter(7));

        expect(chip).toMatchObject({ state: 'failed', failureReason: 'rate limited', attention: true, earlierSentAt: daysAfter(4) });
        expect(chipDetails(chip)).toContain(`An earlier send went out ${formatNumericDateTime(daysAfter(4), undefined, 'el', false)}.`);
        // The delivery alone carries no earlier send
        expect(documentChip(facts({ documentSends: [delivered] }), 'minutes', daysAfter(7)).earlierSentAt).toBeNull();
    });

    it('reads a claim in flight as pending', () => {
        expect(documentChip(facts({ documentSends: [send({ status: 'pending', sentAt: null })] }), 'minutes', daysAfter(3)).state).toBe('pending');
        // Handed to the provider: in progress for a while, then unconfirmed, because it may have gone out
        const handedOver = send({ status: 'sending', sentAt: null, createdAt: daysAfter(3) });
        expect(documentChip(facts({ documentSends: [handedOver] }), 'minutes', new Date(daysAfter(3).getTime() + 60_000))).toMatchObject({ state: 'pending', attention: false });
        expect(documentChip(facts({ documentSends: [handedOver] }), 'minutes', daysAfter(4))).toMatchObject({ state: 'unconfirmed', attention: true });
    });

    it('waits for the decisions before the threshold, and says until when', () => {
        expect(documentChip(facts(), 'minutes', daysAfter(3))).toMatchObject({ state: 'waiting', waitReason: 'decisions', dueAt: new Date('2026-03-19T22:00:00Z'), attention: false });
    });

    it('flags a reviewed meeting with no agenda', () => {
        expect(documentChip(facts({ subjects: [], _count: { subjects: 0 } }), 'minutes', daysAfter(3))).toMatchObject({ state: 'waiting', waitReason: 'agenda', attention: true });
    });

    it('flags the minutes that are overdue: the threshold passed and nothing went out', () => {
        expect(documentChip(facts(), 'minutes', daysAfter(11))).toMatchObject({ state: 'unsent', missingCount: 1, attention: true });
    });

    it('does not flag a reviewed transcript the reviewer chose not to send', () => {
        expect(documentChip(facts(), 'transcript', daysAfter(1))).toMatchObject({ state: 'unsent', attention: false, recipientEmails: ['clerk@example.org'] });
        // An archive meeting of a migrated body (setting with no enabledAt) stays out of the filter too
        expect(documentChip(facts(), 'transcript', daysAfter(400))).toMatchObject({ state: 'unsent', attention: false });
    });

    it('waits for the review without flagging', () => {
        expect(documentChip(facts({ taskStatuses: [] }), 'transcript', daysAfter(1))).toMatchObject({ state: 'waiting', waitReason: 'review', attention: false });
    });

    it('shows a document the body does not send as not enabled', () => {
        const off = facts({ administrativeBody: { documentSendSettings: [setting('minutes', false)] } });
        expect(documentChip(off, 'minutes', daysAfter(20))).toMatchObject({ state: 'notEnabled', attention: false, recipientEmails: [] });
        expect(documentChip(facts({ administrativeBody: null, administrativeBodyId: null }), 'transcript', daysAfter(1)).state).toBe('notEnabled');
    });

    it('gives one chip per document, in a fixed order', () => {
        expect(documentChips(facts(), daysAfter(1)).map(chip => chip.document)).toEqual(['transcript', 'minutes']);
    });

    it('shows only the documents the body sends', () => {
        const off = facts({ administrativeBody: { documentSendSettings: [setting('minutes')] } });
        expect(visibleDocumentChips(documentChips(off, daysAfter(1))).map(chip => chip.document)).toEqual(['minutes']);
        expect(visibleDocumentChips(documentChips(facts({ administrativeBody: null, administrativeBodyId: null }), daysAfter(1)))).toEqual([]);
    });

    it('offers the minutes of a meeting held before the switch-on by hand only, outside the list', () => {
        const later = { ...setting('minutes'), enabledAt: daysAfter(5) };
        const older = facts({ administrativeBody: { documentSendSettings: [setting('transcript'), later] } });
        const chips = documentChips(older, daysAfter(20));

        expect(chips.find(chip => chip.document === 'minutes')).toMatchObject({ state: 'byHandOnly', attention: false });
        expect(visibleDocumentChips(chips).map(chip => chip.document)).toEqual(['transcript']);
        expect(sendableDocumentChips(chips).map(chip => chip.document)).toEqual(['transcript', 'minutes']);
    });
});
