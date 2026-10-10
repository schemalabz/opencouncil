/** @jest-environment node */

// Mock env before importing the module under test.
jest.mock('@/env.mjs', () => ({
    env: {
        RESEND_API_KEY: 'test-key',
    },
}));

// The real resend.ts runs (chunking, pacing, request building). Only the HTTP
// call is stubbed. `sendEmailBatchMock` records each batch the way
// sendEmailBatch(payloads, { idempotencyKey }) receives it, and its return value
// (a BatchEmailResult) is turned into the Resend response that produces it.
const sendEmailBatchMock = jest.fn();

beforeEach(() => {
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
        const payloads = JSON.parse(String(init?.body)) as Array<{ to: string }>;
        const headers = init?.headers as Record<string, string>;
        const result = (await sendEmailBatchMock(payloads, { idempotencyKey: headers['Idempotency-Key'] })) as {
            failedTos: string[];
            error?: string;
        };
        if (result.error) {
            return { ok: false, status: 429, text: async () => result.error } as unknown as Response;
        }
        // Permissive mode reports rejected items by index into the request.
        const used = new Set<number>();
        const errors = result.failedTos.map((to) => {
            const index = payloads.findIndex((p, i) => p.to === to && !used.has(i));
            used.add(index);
            return { index, message: 'rejected' };
        });
        return { ok: true, status: 200, json: async () => ({ data: [], errors }) } as unknown as Response;
    }) as typeof fetch;
});

// DB layer mocks — capture status updates per delivery.
const getPendingDeliveriesMock = jest.fn();
const updateDeliveryStatusMock = jest.fn();
jest.mock('@/lib/db/notifications', () => ({
    getPendingDeliveries: (...args: unknown[]) => getPendingDeliveriesMock(...args),
    updateDeliveryStatus: (...args: unknown[]) => updateDeliveryStatusMock(...args),
}));

import { releaseNotifications } from '../deliver';

function emailDelivery(id: string, to: string) {
    return {
        id,
        medium: 'email',
        email: to,
        title: `Subject ${id}`,
        body: `<p>Body ${id}</p>`,
        notification: { type: 'beforeMeeting', meeting: { scheduleStatus: 'scheduled' } },
    };
}

describe('releaseNotifications — email batching (issue #380)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('skips postponed and cancelled announcements while batching eligible emails', async () => {
        const deliveries = [
            emailDelivery('scheduled', 'scheduled@example.com'),
            { ...emailDelivery('postponed', 'postponed@example.com'), notification: { type: 'beforeMeeting', meeting: { scheduleStatus: 'postponed' } } },
            { ...emailDelivery('cancelled', 'cancelled@example.com'), notification: { type: 'beforeMeeting', meeting: { scheduleStatus: 'cancelled' } } },
            { ...emailDelivery('after', 'after@example.com'), notification: { type: 'afterMeeting', meeting: { scheduleStatus: 'cancelled' } } },
        ];
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({ success: true, failedTos: [] });

        const result = await releaseNotifications(['n1']);

        expect(result).toMatchObject({ success: true, emailsSent: 2, skipped: 2, failed: 0 });
        expect(sendEmailBatchMock).toHaveBeenCalledTimes(1);
        expect(sendEmailBatchMock.mock.calls[0][0].map((item: { to: string }) => item.to)).toEqual(['scheduled@example.com', 'after@example.com']);
        expect(updateDeliveryStatusMock).toHaveBeenCalledWith('postponed', 'skipped');
        expect(updateDeliveryStatusMock).toHaveBeenCalledWith('cancelled', 'skipped');
    });

    it('sends all emails in a single batch when count <= 100, without 500ms per-email delay', async () => {
        const deliveries = Array.from({ length: 50 }, (_, i) =>
            emailDelivery(`d${i}`, `user${i}@example.com`),
        );
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({ success: true, failedTos: [] });

        const result = await releaseNotifications(['n1']);

        expect(sendEmailBatchMock).toHaveBeenCalledTimes(1);
        const [payloads, opts] = sendEmailBatchMock.mock.calls[0];
        expect(payloads).toHaveLength(50);
        expect(payloads[0]).toMatchObject({
            to: 'user0@example.com',
            subject: 'Subject d0',
            html: '<p>Body d0</p>',
        });
        expect(opts.idempotencyKey).toEqual(expect.any(String));
        expect(result).toEqual({ success: true, emailsSent: 50, skipped: 0, failed: 0, leftPending: 0 });
        expect(updateDeliveryStatusMock).toHaveBeenCalledTimes(50);
        for (const call of updateDeliveryStatusMock.mock.calls) {
            expect(call[1]).toBe('sent');
        }
    });

    it('chunks emails into batches of 100', async () => {
        const deliveries = Array.from({ length: 250 }, (_, i) =>
            emailDelivery(`d${i}`, `u${i}@x.com`),
        );
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({ success: true, failedTos: [] });

        const result = await releaseNotifications(['n1']);

        expect(sendEmailBatchMock).toHaveBeenCalledTimes(3);
        expect(sendEmailBatchMock.mock.calls[0][0]).toHaveLength(100);
        expect(sendEmailBatchMock.mock.calls[1][0]).toHaveLength(100);
        expect(sendEmailBatchMock.mock.calls[2][0]).toHaveLength(50);
        expect(result.emailsSent).toBe(250);
        expect(result.failed).toBe(0);
    });

    it('marks per-recipient failures from batch response', async () => {
        const deliveries = [
            emailDelivery('d1', 'ok@x.com'),
            emailDelivery('d2', 'bad@x.com'),
            emailDelivery('d3', 'ok2@x.com'),
        ];
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({
            success: false,
            failedTos: ['bad@x.com'],
        });

        const result = await releaseNotifications(['n1']);

        expect(result.emailsSent).toBe(2);
        expect(result.failed).toBe(1);

        const byId = new Map(updateDeliveryStatusMock.mock.calls.map((c) => [c[0], c[1]]));
        expect(byId.get('d1')).toBe('sent');
        expect(byId.get('d2')).toBe('failed');
        expect(byId.get('d3')).toBe('sent');
    });

    it('marks deliveries missing email/title/body as failed before batch send', async () => {
        const deliveries = [
            emailDelivery('d1', 'ok@x.com'),
            { ...emailDelivery('d2', 'invalid@example.com'), email: null },
        ];
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({ success: true, failedTos: [] });

        const result = await releaseNotifications(['n1']);

        expect(sendEmailBatchMock).toHaveBeenCalledTimes(1);
        expect(sendEmailBatchMock.mock.calls[0][0]).toHaveLength(1);
        expect(result.emailsSent).toBe(1);
        expect(result.failed).toBe(1);
    });

    it('uses a deterministic idempotency key for the same delivery set', async () => {
        const deliveries = [emailDelivery('a', 'a@x.com'), emailDelivery('b', 'b@x.com')];
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({ success: true, failedTos: [] });

        await releaseNotifications(['n1']);
        const firstKey = sendEmailBatchMock.mock.calls[0][1].idempotencyKey;

        sendEmailBatchMock.mockClear();
        await releaseNotifications(['n1']);
        const secondKey = sendEmailBatchMock.mock.calls[0][1].idempotencyKey;

        expect(firstKey).toBe(secondKey);
    });

    it('skips batch call entirely when there are no email deliveries', async () => {
        getPendingDeliveriesMock.mockResolvedValue([]);
        const result = await releaseNotifications(['n1']);
        expect(sendEmailBatchMock).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true, emailsSent: 0, skipped: 0, failed: 0, leftPending: 0 });
    });

    it('marks message deliveries skipped and keeps them out of the email batch', async () => {
        getPendingDeliveriesMock.mockResolvedValue([
            emailDelivery('e1', 'a@example.com'),
            { id: 'm1', medium: 'message', phone: '+306900000000', notification: { type: 'beforeMeeting', meeting: { scheduleStatus: 'scheduled' } } },
        ]);
        sendEmailBatchMock.mockResolvedValue({ success: true, failedTos: [] });

        const result = await releaseNotifications(['n1']);

        expect(sendEmailBatchMock.mock.calls[0][0]).toHaveLength(1);
        expect(updateDeliveryStatusMock).toHaveBeenCalledWith('m1', 'skipped');
        expect(result).toEqual({ success: true, emailsSent: 1, skipped: 1, failed: 0, leftPending: 0 });
    });

    it('attributes per-recipient failures correctly when two deliveries share an email', async () => {
        // Same `to` appears twice; Resend reports the address once in failedTos
        // when only one of the two sends fails. Must mark exactly one as failed.
        const deliveries = [
            emailDelivery('d1', 'dup@x.com'),
            emailDelivery('d2', 'dup@x.com'),
            emailDelivery('d3', 'other@x.com'),
        ];
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({
            success: false,
            failedTos: ['dup@x.com'],
        });

        const result = await releaseNotifications(['n1']);

        expect(result.emailsSent).toBe(2);
        expect(result.failed).toBe(1);

        const statuses = updateDeliveryStatusMock.mock.calls
            .filter((c) => ['d1', 'd2'].includes(c[0]))
            .map((c) => c[1])
            .sort();
        expect(statuses).toEqual(['failed', 'sent']);
    });

    it('leaves deliveries pending when the whole batch fails, so a re-release retries them', async () => {
        // A whole-batch failure (non-2xx / network throw) sets `error` and returns
        // every `to`. No recipient was rejected, so no row may become final.
        const deliveries = [
            emailDelivery('d1', 'dup@x.com'),
            emailDelivery('d2', 'dup@x.com'),
        ];
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({
            success: false,
            failedTos: ['dup@x.com', 'dup@x.com'],
            error: 'Resend batch returned 429',
        });

        const result = await releaseNotifications(['n1']);

        expect(result.emailsSent).toBe(0);
        expect(result.failed).toBe(2);
        expect(result.leftPending).toBe(2);
        expect(updateDeliveryStatusMock).not.toHaveBeenCalled();
    });

    it('marks only the rejected rows failed and still sends the rest after a whole-batch failure', async () => {
        // Two chunks: the first fails as a whole, the second succeeds.
        const deliveries = Array.from({ length: 150 }, (_, i) => emailDelivery(`d${i}`, `u${i}@x.com`));
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock
            .mockResolvedValueOnce({ success: false, failedTos: [], error: 'Resend batch returned 503' })
            .mockResolvedValueOnce({ success: true, failedTos: [] });

        const result = await releaseNotifications(['n1']);

        expect(result).toEqual({ success: true, emailsSent: 50, skipped: 0, failed: 100, leftPending: 100 });
        const touched = new Set(updateDeliveryStatusMock.mock.calls.map((c) => c[0]));
        expect(touched.has('d0')).toBe(false);
        expect(touched.has('d149')).toBe(true);
    });
});
