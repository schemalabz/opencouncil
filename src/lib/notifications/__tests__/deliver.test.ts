/** @jest-environment node */

// Mock env before importing the module under test.
jest.mock('@/env.mjs', () => ({
    env: {
        RESEND_API_KEY: 'test-key',
        BIRD_API_KEY: '',
    },
}));

// Mock the Resend batch helper — we assert call shape and choose the return.
const sendEmailBatchMock = jest.fn();
jest.mock('@/lib/email/resend', () => ({
    sendEmailBatch: (...args: any[]) => sendEmailBatchMock(...args),
}));

// DB layer mocks — capture status updates per delivery.
const getPendingDeliveriesMock = jest.fn();
const updateDeliveryStatusMock = jest.fn();
jest.mock('@/lib/db/notifications', () => ({
    getPendingDeliveries: (...args: any[]) => getPendingDeliveriesMock(...args),
    updateDeliveryStatus: (...args: any[]) => updateDeliveryStatusMock(...args),
}));

// Bird/outbound are not exercised in email-only tests — stub them out.
jest.mock('../bird', () => ({
    createOrUpdateConversation: jest.fn(),
    sendSMSMessage: jest.fn(),
}));
jest.mock('../outbound', () => ({
    sendAndPersistOutbound: jest.fn(),
}));

import { releaseNotifications } from '../deliver';

function emailDelivery(id: string, to: string) {
    return {
        id,
        medium: 'email',
        email: to,
        title: `Subject ${id}`,
        body: `<p>Body ${id}</p>`,
    };
}

describe('releaseNotifications — email batching (issue #380)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        expect(result).toEqual({ success: true, emailsSent: 50, messagesSent: 0, failed: 0 });
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
            { id: 'd2', medium: 'email', email: null, title: 't', body: 'b' },
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
        expect(result).toEqual({ success: true, emailsSent: 0, messagesSent: 0, failed: 0 });
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

    it('marks both shared-email deliveries failed when the whole batch fails', async () => {
        // Whole-batch failure (non-2xx / network throw) returns every `to`,
        // so a duplicate recipient appears twice and both rows must fail.
        const deliveries = [
            emailDelivery('d1', 'dup@x.com'),
            emailDelivery('d2', 'dup@x.com'),
        ];
        getPendingDeliveriesMock.mockResolvedValue(deliveries);
        sendEmailBatchMock.mockResolvedValue({
            success: false,
            failedTos: ['dup@x.com', 'dup@x.com'],
        });

        const result = await releaseNotifications(['n1']);

        expect(result.emailsSent).toBe(0);
        expect(result.failed).toBe(2);

        const statuses = updateDeliveryStatusMock.mock.calls
            .filter((c) => ['d1', 'd2'].includes(c[0]))
            .map((c) => c[1]);
        expect(statuses).toEqual(['failed', 'failed']);
    });
});
