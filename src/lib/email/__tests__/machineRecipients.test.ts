/** @jest-environment node */
const mockSend = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...a: unknown[]) => mockSend(...a) } })) }));
jest.mock('@/env.mjs', () => ({
    env: { RESEND_API_KEY: 'test-key', DEPLOYMENT_ENV: 'production', DEV_EMAIL_OVERRIDE: undefined },
}));

import { sendEmail, sendEmailBatch } from '@/lib/email/resend';

// A machine account (#590) has no mailbox: every app email passes through
// these two functions, so the reserved domain is dropped here.
beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockSend.mockResolvedValue({ data: { id: 'e1' }, error: null });
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
        const items = JSON.parse(String(init?.body)) as unknown[];
        return { ok: true, status: 200, json: async () => ({ data: items.map(() => ({ id: 'x' })) }) } as Response;
    }) as typeof fetch;
});

describe('machine-account recipients', () => {
    it('sends nothing to a machine account, and still sends to a person', async () => {
        await expect(sendEmail({ from: 'notifications', to: 'Paola@machines.opencouncil.invalid', subject: 's', html: '<p/>' }))
            .resolves.toMatchObject({ success: true });
        expect(mockSend).not.toHaveBeenCalled();

        await sendEmail({ from: 'notifications', to: 'anna@example.com', cc: ['bot@machines.opencouncil.invalid', 'b@example.com'], subject: 's', html: '<p/>' });
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'anna@example.com', cc: ['b@example.com'] }));
    });

    it('drops machine accounts from a batch and keeps the people', async () => {
        const result = await sendEmailBatch([
            { from: 'notifications', to: 'anna@example.com', subject: 's', html: '<p/>' },
            { from: 'notifications', to: 'paola@machines.opencouncil.invalid', subject: 's', html: '<p/>' },
        ], { idempotencyKey: 'k' });

        expect(result).toEqual({ success: true, failedTos: [] });
        const sent = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body)) as Array<{ to: string }>;
        expect(sent.map(item => item.to)).toEqual(['anna@example.com']);
    });

    it('makes no call for a batch of machine accounts only', async () => {
        await expect(sendEmailBatch([{ from: 'notifications', to: 'paola@machines.opencouncil.invalid', subject: 's', html: '<p/>' }], { idempotencyKey: 'k' }))
            .resolves.toEqual({ success: true, failedTos: [] });
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
