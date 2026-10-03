/** @jest-environment node */

jest.mock('@/env.mjs', () => ({
    env: { RESEND_API_KEY: 'test-key', DEPLOYMENT_ENV: 'production', DEV_EMAIL_OVERRIDE: undefined },
}));

import { sendEmailInBatches, type BatchEmailItem } from '@/lib/email/resend';

const sentBatches: Array<{ size: number; key: string }> = [];

beforeEach(() => {
    jest.useFakeTimers();
    sentBatches.length = 0;
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
        const items = JSON.parse(String(init?.body)) as unknown[];
        const headers = init?.headers as Record<string, string>;
        sentBatches.push({ size: items.length, key: headers['Idempotency-Key'] });
        return { ok: true, status: 200, json: async () => ({ data: items.map(() => ({ id: 'x' })) }) } as Response;
    }) as typeof fetch;
});

afterEach(() => {
    jest.useRealTimers();
});

const email = (i: number): BatchEmailItem => ({ from: 'a@x.gr', to: `u${i}@x.gr`, subject: 's', html: '<p/>' });

async function run<T>(items: T[], toEmail: (item: T) => BatchEmailItem, onBatch = jest.fn()) {
    const done = sendEmailInBatches(items, {
        toEmail,
        idempotencyKey: (batch) => `key-${batch.length}-${sentBatches.length}`,
        onBatch,
    });
    await jest.runAllTimersAsync();
    await done;
    return onBatch;
}

describe('sendEmailInBatches', () => {
    it("chunks to Resend's limit of 100", async () => {
        await run(Array.from({ length: 250 }, (_, i) => email(i)), (e) => e);
        expect(sentBatches.map((b) => b.size)).toEqual([100, 100, 50]);
    });

    it('sends nothing for an empty list', async () => {
        const onBatch = await run([], (e: BatchEmailItem) => e);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(onBatch).not.toHaveBeenCalled();
    });

    it('pauses 500 ms between calls, not before the first', async () => {
        const done = sendEmailInBatches(Array.from({ length: 150 }, (_, i) => email(i)), {
            toEmail: (e) => e,
            idempotencyKey: () => 'k',
            onBatch: jest.fn(),
        });
        await jest.advanceTimersByTimeAsync(0);
        expect(sentBatches).toHaveLength(1);
        await jest.advanceTimersByTimeAsync(499);
        expect(sentBatches).toHaveLength(1);
        await jest.advanceTimersByTimeAsync(1);
        await done;
        expect(sentBatches).toHaveLength(2);
    });

    it('hands each batch of caller items to onBatch before the next send', async () => {
        const order: string[] = [];
        const items = Array.from({ length: 150 }, (_, i) => ({ id: `d${i}`, payload: email(i) }));
        global.fetch = jest.fn(async (_u: unknown, init?: RequestInit) => {
            order.push(`send:${(JSON.parse(String(init?.body)) as unknown[]).length}`);
            return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
        }) as typeof fetch;

        await run(items, (item) => item.payload, jest.fn((batch: typeof items) => {
            order.push(`onBatch:${batch[0].id}`);
        }));

        expect(order).toEqual(['send:100', 'onBatch:d0', 'send:50', 'onBatch:d100']);
    });

    it('derives one idempotency key per batch from that batch', async () => {
        await run(Array.from({ length: 150 }, (_, i) => email(i)), (e) => e);
        expect(sentBatches.map((b) => b.key)).toEqual(['key-100-0', 'key-50-1']);
    });
});
