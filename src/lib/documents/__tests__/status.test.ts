import { attemptsExhausted, documentState, shownDocumentState, skipsAutomaticSend } from '../status';
import { MAX_AUTOMATIC_ATTEMPTS, STALE_PENDING_MINUTES } from '../settings';
import { daysAfter, documentSend as send, minutesDueAtFixture, readinessFacts as facts, reviewTask, setting, summarizeTask } from './factsFixture';

const minute = 60 * 1000;

describe('documentState', () => {
    it('reads a complete send as sent, with its recipients, time and trigger', () => {
        const state = documentState(facts({ documentSends: [send({ trigger: 'review', kind: 'transcript', recipientEmails: ['a@example.org', 'b@example.org'] })] }), 'transcript', daysAfter(3));
        expect(state).toMatchObject({ state: 'sent', trigger: 'review', recipientEmails: ['a@example.org', 'b@example.org'], sentAt: daysAfter(2) });
    });

    it('reads an incomplete send with the count of the subjects it lacked', () => {
        const state = documentState(facts({ documentSends: [send({ _count: { missingSubjects: 2 }, trigger: 'threshold' })] }), 'minutes', daysAfter(12));
        expect(state).toMatchObject({ state: 'sentIncomplete', missingCount: 2, trigger: 'threshold' });
    });

    it('reads only the sends of the kind asked for', () => {
        const transcriptSent = facts({ documentSends: [send({ kind: 'transcript' })] });
        expect(documentState(transcriptSent, 'transcript', daysAfter(3)).state).toBe('sent');
        expect(documentState(transcriptSent, 'minutes', daysAfter(3)).state).toBe('waiting');
    });

    it('lets a later complete send by hand replace an incomplete one', () => {
        const sends = [
            send({ id: 'b', trigger: 'manual', createdAt: daysAfter(15), sentAt: daysAfter(15) }),
            send({ id: 'a', _count: { missingSubjects: 1 }, createdAt: daysAfter(10) }),
        ];
        expect(documentState(facts({ documentSends: sends }), 'minutes', daysAfter(16))).toMatchObject({ state: 'sent', trigger: 'manual' });
    });

    it('reads a failed send as failed, with its reason, until a send succeeds', () => {
        const failed = send({ status: 'failed', failureReason: 'stale', sentAt: null });
        expect(documentState(facts({ documentSends: [failed] }), 'minutes', daysAfter(3))).toMatchObject({ state: 'failed', failureReason: 'stale' });
        expect(documentState(facts({ documentSends: [send({ id: 'ok', createdAt: daysAfter(4) }), failed] }), 'minutes', daysAfter(5)).state).toBe('sent');
    });

    it('shows a failed resend as failed, and keeps the earlier delivery', () => {
        const delivered = send({ id: 'first', createdAt: daysAfter(4), sentAt: daysAfter(4) });
        const resend = send({ id: 'again', status: 'failed', failureReason: 'rate limited', trigger: 'manual', sentAt: null, createdAt: daysAfter(6) });

        expect(documentState(facts({ documentSends: [resend, delivered] }), 'minutes', daysAfter(7))).toMatchObject({ state: 'failed', failureReason: 'rate limited', earlierSentAt: daysAfter(4) });
        // The delivery alone carries no earlier send
        expect(documentState(facts({ documentSends: [delivered] }), 'minutes', daysAfter(7)).earlierSentAt).toBeNull();
    });

    it('reads a pending claim as pending, and one older than the stale limit as failed (stale): its sender died before the email', () => {
        const claim = send({ status: 'pending', sentAt: null, createdAt: daysAfter(3) });
        const atTheLimit = new Date(daysAfter(3).getTime() + STALE_PENDING_MINUTES * minute);
        expect(documentState(facts({ documentSends: [claim] }), 'minutes', atTheLimit).state).toBe('pending');
        expect(documentState(facts({ documentSends: [claim] }), 'minutes', new Date(atTheLimit.getTime() + 1)))
            .toMatchObject({ state: 'failed', failureReason: 'stale' });
    });

    it('reads a claim handed over as pending for a while, then as unconfirmed, because it may have gone out', () => {
        const handedOver = send({ status: 'sending', sentAt: null, createdAt: daysAfter(3) });
        expect(documentState(facts({ documentSends: [handedOver] }), 'minutes', new Date(daysAfter(3).getTime() + minute)).state).toBe('pending');
        expect(documentState(facts({ documentSends: [handedOver] }), 'minutes', daysAfter(4)).state).toBe('unconfirmed');
    });

    it('waits for the decisions before the threshold, and says until when', () => {
        expect(documentState(facts(), 'minutes', daysAfter(3))).toMatchObject({ state: 'waiting', waitReason: 'decisions', dueAt: minutesDueAtFixture });
    });

    it('waits for the agenda of a reviewed meeting with none', () => {
        expect(documentState(facts({ subjects: [], _count: { subjects: 0 } }), 'minutes', daysAfter(3))).toMatchObject({ state: 'waiting', waitReason: 'agenda' });
    });

    it('waits for the summarize of a reviewed meeting', () => {
        expect(documentState(facts({ taskStatuses: [reviewTask] }), 'minutes', daysAfter(3))).toMatchObject({ state: 'waiting', waitReason: 'summarize', dueAt: null });
    });

    it('reads the minutes as unsent once the threshold passed and nothing went out', () => {
        expect(documentState(facts(), 'minutes', daysAfter(11))).toMatchObject({ state: 'unsent', missingCount: 1 });
    });

    it('waits for the review', () => {
        expect(documentState(facts({ taskStatuses: [summarizeTask] }), 'minutes', daysAfter(1))).toMatchObject({ state: 'waiting', waitReason: 'review' });
    });

    it('reads a document the body does not send as not enabled', () => {
        const off = facts({ administrativeBody: { documentSendSettings: [setting('minutes', { enabled: false })] } });
        expect(documentState(off, 'minutes', daysAfter(20))).toMatchObject({ state: 'notEnabled', recipientEmails: [] });
        expect(documentState(facts({ administrativeBody: null, administrativeBodyId: null }), 'minutes', daysAfter(1)).state).toBe('notEnabled');
    });

    it('offers the minutes of a meeting held before the switch-on by hand only', () => {
        const older = facts({ administrativeBody: { documentSendSettings: [setting('transcript'), setting('minutes', { enabledAt: daysAfter(5) })] } });
        expect(documentState(older, 'minutes', daysAfter(20)).state).toBe('byHandOnly');
    });
});

describe('shownDocumentState', () => {
    it('is null for a document the body does not send, and the state otherwise', () => {
        const off = facts({ administrativeBody: { documentSendSettings: [setting('minutes', { enabled: false })] } });
        expect(shownDocumentState(off, 'minutes', daysAfter(3))).toBeNull();
        expect(shownDocumentState(facts(), 'minutes', daysAfter(3))).toMatchObject({ state: 'waiting', waitReason: 'decisions' });
        expect(shownDocumentState(facts({ documentSends: [send()] }), 'minutes', daysAfter(3))).toMatchObject({ state: 'sent' });
    });
});

describe('skipsAutomaticSend and attemptsExhausted', () => {
    const failedAutomatic = (n: number, trigger: 'complete' | 'threshold' | 'review' = 'complete') =>
        Array.from({ length: n }, (_, i) => send({ id: `f${i}`, status: 'failed', trigger, sentAt: null, failureReason: 'refused' }));

    it.each(['sent', 'pending', 'sending'] as const)('skips a document with a %s send, automatic or by hand', (status) => {
        expect(skipsAutomaticSend(facts({ documentSends: [send({ status, trigger: 'complete' })] }), 'minutes')).toBe(true);
        expect(skipsAutomaticSend(facts({ documentSends: [send({ status, trigger: 'manual' })] }), 'minutes')).toBe(true);
    });

    it('does not skip after a failed send, nor for a send of another kind', () => {
        expect(skipsAutomaticSend(facts({ documentSends: [send({ status: 'failed', sentAt: null })] }), 'minutes')).toBe(false);
        expect(skipsAutomaticSend(facts({ documentSends: [send({ kind: 'transcript' })] }), 'minutes')).toBe(false);
        expect(skipsAutomaticSend(facts(), 'minutes')).toBe(false);
    });

    it(`counts the failed automatic attempts up to ${MAX_AUTOMATIC_ATTEMPTS}`, () => {
        expect(attemptsExhausted(facts({ documentSends: failedAutomatic(MAX_AUTOMATIC_ATTEMPTS - 1) }), 'minutes')).toBe(false);
        expect(attemptsExhausted(facts({ documentSends: failedAutomatic(MAX_AUTOMATIC_ATTEMPTS) }), 'minutes')).toBe(true);
        expect(attemptsExhausted(facts({ documentSends: failedAutomatic(MAX_AUTOMATIC_ATTEMPTS, 'threshold') }), 'minutes')).toBe(true);
        expect(skipsAutomaticSend(facts({ documentSends: failedAutomatic(MAX_AUTOMATIC_ATTEMPTS) }), 'minutes')).toBe(true);
    });

    it('does not count failed sends by hand, nor those of another kind', () => {
        const manual = Array.from({ length: MAX_AUTOMATIC_ATTEMPTS }, (_, i) => send({ id: `m${i}`, status: 'failed', trigger: 'manual', sentAt: null }));
        expect(attemptsExhausted(facts({ documentSends: manual }), 'minutes')).toBe(false);
        const transcript = failedAutomatic(MAX_AUTOMATIC_ATTEMPTS, 'review').map(row => ({ ...row, kind: 'transcript' as const }));
        expect(attemptsExhausted(facts({ documentSends: transcript }), 'minutes')).toBe(false);
        expect(attemptsExhausted(facts({ documentSends: transcript }), 'transcript')).toBe(true);
    });
});
