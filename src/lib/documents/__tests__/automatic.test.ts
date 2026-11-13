/** @jest-environment node */
// The cron loop and the hooks of automatic.ts, against mocked queries and a
// mocked sender. The integration test covers them against a database.
const mockFailStale = jest.fn();
const mockFindCandidates = jest.fn();
const mockGetFacts = jest.fn();
jest.mock('@/lib/db/documentSends', () => ({
    CANDIDATE_PAGE_SIZE: 3,
    failStaleDocumentSends: (...a: unknown[]) => mockFailStale(...a),
    findDocumentSendCandidates: (...a: unknown[]) => mockFindCandidates(...a),
    getReadinessFacts: (...a: unknown[]) => mockGetFacts(...a),
}));
const mockSendDocument = jest.fn();
jest.mock('../send', () => ({ sendDocument: (...a: unknown[]) => mockSendDocument(...a) }));

import type { ReadinessFacts } from '@/lib/db/types';
import { documentsAfterReview, sendDueDocuments, sendReadyDocuments, waitsForPoll, type AutomaticSendOutcome } from '../automatic';
import { MAX_AUTOMATIC_ATTEMPTS } from '../settings';
import { daysAfter, documentSend as send, meetingDate, readinessFacts, setting, summarizeTask } from './factsFixture';

const now = daysAfter(2);
const settings = [setting('transcript', { recipientEmails: ['t@example.org'] }), setting('minutes', { recipientEmails: ['m@example.org'] })];

/** A reviewed, summarized meeting whose minutes are complete. */
function facts(id: string, overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
    return readinessFacts({
        id,
        administrativeBody: { type: 'council' as const, documentSendSettings: settings },
        subjects: [{ id: 's1', decision: { id: 'd1' } }],
        _count: { subjects: 1 },
        ...overrides,
    });
}

/** A candidate that waits for its decisions at `now`. */
const waiting = (id: string, cityId = 'c1') => facts(id, { cityId, subjects: [{ id: 's1', decision: null }] });

const failedAutomatic = (n: number) => Array.from({ length: n }, (_, i) => send({ id: `f${i}`, status: 'failed', trigger: 'complete', sentAt: null }));

const sent = { success: true, readiness: { state: 'complete' }, recipientEmails: ['m@example.org'] };

beforeEach(() => {
    // reset, not clear: an unconsumed mockResolvedValueOnce must not leak into the next test
    jest.resetAllMocks();
    mockFindCandidates.mockResolvedValue([]);
    mockFailStale.mockResolvedValue(0);
    mockSendDocument.mockResolvedValue(sent);
});

describe('sendDueDocuments', () => {
    it('releases the stale claims first and reports how many', async () => {
        mockFailStale.mockResolvedValue(4);
        expect(await sendDueDocuments({ now })).toMatchObject({ staleReleased: 4 });
        expect(mockFailStale).toHaveBeenCalledWith(now);
        expect(mockFailStale.mock.invocationCallOrder[0]).toBeLessThan(mockFindCandidates.mock.invocationCallOrder[0]);
    });

    it('stops at the batch limit, counting failures with sends', async () => {
        mockFindCandidates.mockResolvedValueOnce([facts('a'), facts('b'), facts('c')]);
        mockSendDocument
            .mockResolvedValueOnce({ success: false, error: 'refused' })
            .mockResolvedValueOnce({ success: true, readiness: { state: 'incomplete', missingSubjectIds: ['s9'] } });

        const summary = await sendDueDocuments({ now, limit: 2 });

        expect(mockSendDocument).toHaveBeenCalledTimes(2);
        expect(mockSendDocument).toHaveBeenCalledWith('c1', 'a', 'minutes', { by: 'automatic' });
        expect(summary.failed).toEqual([{ cityId: 'c1', meetingId: 'a', document: 'minutes', error: 'refused' }]);
        expect(summary.sent).toEqual([{ cityId: 'c1', meetingId: 'b', document: 'minutes', complete: false }]);
    });

    it('reports a sent complete document as complete', async () => {
        mockFindCandidates.mockResolvedValueOnce([facts('a')]);
        expect((await sendDueDocuments({ now })).sent).toEqual([{ cityId: 'c1', meetingId: 'a', document: 'minutes', complete: true }]);
    });

    it('counts a candidate whose automatic attempts are used up, and does not evaluate it', async () => {
        mockFindCandidates.mockResolvedValueOnce([facts('a', { documentSends: failedAutomatic(MAX_AUTOMATIC_ATTEMPTS) })]);

        const summary = await sendDueDocuments({ now });

        expect(summary).toMatchObject({ exhausted: 1, evaluated: 0, sent: [] });
        expect(mockSendDocument).not.toHaveBeenCalled();
    });

    it('still tries a candidate with fewer failed automatic attempts, or with failed manual ones', async () => {
        const manualFailures = Array.from({ length: MAX_AUTOMATIC_ATTEMPTS }, (_, i) => send({ id: `m${i}`, status: 'failed', trigger: 'manual', sentAt: null }));
        mockFindCandidates.mockResolvedValueOnce([
            facts('a', { documentSends: failedAutomatic(MAX_AUTOMATIC_ATTEMPTS - 1) }),
            facts('b', { documentSends: manualFailures }),
        ]);

        const summary = await sendDueDocuments({ now });

        expect(summary).toMatchObject({ exhausted: 0, evaluated: 2 });
        expect(mockSendDocument).toHaveBeenCalledTimes(2);
    });

    it('reads the next page from the last candidate of a full page, city included, and stops after a short page', async () => {
        mockFindCandidates.mockResolvedValueOnce([waiting('a'), waiting('b'), waiting('z', 'c2')]).mockResolvedValueOnce([facts('ready')]);

        const summary = await sendDueDocuments({ now });

        expect(mockFindCandidates).toHaveBeenCalledTimes(2);
        expect(mockFindCandidates.mock.calls[0]).toEqual(['minutes', now, null]);
        expect(mockFindCandidates.mock.calls[1]).toEqual(['minutes', now, { dateTime: meetingDate, cityId: 'c2', id: 'z' }]);
        expect(summary).toMatchObject({ waiting: 3, evaluated: 4, sent: [{ meetingId: 'ready' }] });
    });

    it('reads a third page after two full ones', async () => {
        mockFindCandidates
            .mockResolvedValueOnce([waiting('a'), waiting('b'), waiting('c')])
            .mockResolvedValueOnce([waiting('d'), waiting('e'), waiting('f')])
            .mockResolvedValueOnce([]);
        await sendDueDocuments({ now });
        expect(mockFindCandidates).toHaveBeenCalledTimes(3);
        expect(mockFindCandidates.mock.calls[2][2]).toEqual({ dateTime: meetingDate, cityId: 'c1', id: 'f' });
    });

    it('counts a candidate the setting does not cover apart from one that waits, and sends neither', async () => {
        mockFindCandidates.mockResolvedValueOnce([
            facts('before-switch', { administrativeBody: { type: 'council' as const, documentSendSettings: [setting('minutes', { enabledAt: daysAfter(1) })] } }),
            facts('later-part', { continuationOfId: 'first', kind: null, continuationOf: { kind: 'ordinary' } }),
            waiting('decisions'),
        ]).mockResolvedValueOnce([facts('not-summarized', { taskStatuses: [] })]);

        const summary = await sendDueDocuments({ now });

        expect(summary).toMatchObject({ notCovered: 2, waiting: 2, evaluated: 4, sent: [], failed: [] });
        expect(mockSendDocument).not.toHaveBeenCalled();
    });

    it('counts a send the sender skipped as waiting, not as sent', async () => {
        mockFindCandidates.mockResolvedValueOnce([facts('a'), facts('b')]);
        mockSendDocument.mockResolvedValueOnce({ success: true, skipped: true });

        const summary = await sendDueDocuments({ now });

        expect(summary).toMatchObject({ waiting: 1, sent: [{ meetingId: 'b' }], failed: [] });
    });

    it('records a candidate whose send throws as failed, and goes on with the next', async () => {
        mockFindCandidates.mockResolvedValueOnce([facts('a'), facts('b')]);
        mockSendDocument.mockRejectedValueOnce(new Error('db down'));

        const summary = await sendDueDocuments({ now });

        expect(summary.failed).toEqual([{ cityId: 'c1', meetingId: 'a', document: 'minutes', error: 'db down' }]);
        expect(summary.sent).toEqual([{ cityId: 'c1', meetingId: 'b', document: 'minutes', complete: true }]);
    });
});

describe('sendReadyDocuments', () => {
    it('asks the sender for every automatic document, as automatic, and returns what it said', async () => {
        const outcomes = await sendReadyDocuments('c1', 'm1');
        expect(mockSendDocument).toHaveBeenCalledTimes(1);
        expect(mockSendDocument).toHaveBeenCalledWith('c1', 'm1', 'minutes', { by: 'automatic' });
        expect(outcomes).toEqual([{ document: 'minutes', readiness: { state: 'complete' }, result: sent }]);
    });

    it('reads no readiness when the sender returned none', async () => {
        const failure = { success: false, error: 'Meeting not found: c1/m1' };
        mockSendDocument.mockResolvedValue(failure);
        expect(await sendReadyDocuments('c1', 'm1')).toEqual([{ document: 'minutes', readiness: null, result: failure }]);
    });
});

describe('waitsForPoll', () => {
    const outcome = (readiness: AutomaticSendOutcome['readiness']): AutomaticSendOutcome =>
        ({ document: 'minutes', readiness, result: { success: true, skipped: true } });

    it('is true when a document waits for the poll after the summarize', () => {
        expect(waitsForPoll([outcome({ state: 'wait', reason: 'poll', dueAt: null })])).toBe(true);
    });

    it('is false for any other wait, a send, or no readiness', () => {
        expect(waitsForPoll([])).toBe(false);
        expect(waitsForPoll([outcome({ state: 'wait', reason: 'decisions', dueAt: daysAfter(5) })])).toBe(false);
        expect(waitsForPoll([outcome({ state: 'wait', reason: 'summarize', dueAt: null })])).toBe(false);
        expect(waitsForPoll([outcome({ state: 'incomplete', missingSubjectIds: ['s1'] })])).toBe(false);
        expect(waitsForPoll([outcome(null)])).toBe(false);
    });
});

describe('documentsAfterReview', () => {
    it('promises the minutes of an unreviewed meeting as if the review were done', async () => {
        mockGetFacts.mockResolvedValue(facts('m1', { taskStatuses: [summarizeTask] }));
        expect(await documentsAfterReview('c1', 'm1', now)).toEqual([{ document: 'minutes', recipientEmails: ['m@example.org'], readiness: { state: 'complete' } }]);
        expect(mockGetFacts).toHaveBeenCalledWith('c1', 'm1');
    });

    it('tells the reviewer that the minutes wait for the summarize', async () => {
        mockGetFacts.mockResolvedValue(facts('m1', { taskStatuses: [] }));
        expect(await documentsAfterReview('c1', 'm1', now)).toEqual([{ document: 'minutes', recipientEmails: ['m@example.org'], readiness: { state: 'wait', reason: 'summarize', dueAt: null } }]);
    });

    it('promises nothing that the automatic senders would skip, or that the setting does not cover', async () => {
        mockGetFacts.mockResolvedValue(facts('m1', { documentSends: [send({ trigger: 'manual' })] }));
        expect(await documentsAfterReview('c1', 'm1', now)).toEqual([]);
        mockGetFacts.mockResolvedValue(facts('m1', { documentSends: failedAutomatic(MAX_AUTOMATIC_ATTEMPTS) }));
        expect(await documentsAfterReview('c1', 'm1', now)).toEqual([]);
        mockGetFacts.mockResolvedValue(facts('m1', { administrativeBody: { type: 'council' as const, documentSendSettings: [setting('minutes', { enabledAt: daysAfter(1) })] } }));
        expect(await documentsAfterReview('c1', 'm1', now)).toEqual([]);
    });

    it('promises nothing for a meeting that does not exist', async () => {
        mockGetFacts.mockResolvedValue(null);
        expect(await documentsAfterReview('c1', 'm1', now)).toEqual([]);
    });
});
