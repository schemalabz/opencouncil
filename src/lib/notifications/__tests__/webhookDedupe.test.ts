/** @jest-environment node */

// In-memory stand-in for a Valkey/redis client driven by the tests.
const store = new Set<string>();
const setMock = jest.fn(
    async (key: string, _value: string, _opts: { NX?: boolean; EX?: number }) => {
        if (store.has(key)) return null; // NX: key exists → no write
        store.add(key);
        return 'OK';
    },
);
const delMock = jest.fn(async (key: string) => {
    const had = store.delete(key);
    return had ? 1 : 0;
});

let connectShouldThrow = false;
const connectMock = jest.fn(async () => {
    if (connectShouldThrow) throw new Error('connect failed');
});

jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
        isReady: true,
        connect: connectMock,
        disconnect: jest.fn(async () => {}),
        on: jest.fn(),
        set: setMock,
        del: delMock,
    })),
}));

// env is read at call time inside markWebhookSeen via the module; mock it so we
// can toggle CACHE_URL between tests.
jest.mock('@/env.mjs', () => ({
    env: { get CACHE_URL() { return process.env.__TEST_CACHE_URL; } },
}));

describe('markWebhookSeen', () => {
    beforeEach(() => {
        jest.resetModules();
        store.clear();
        setMock.mockClear();
        delMock.mockClear();
        connectMock.mockClear();
        connectShouldThrow = false;
        process.env.__TEST_CACHE_URL = 'valkeys://localhost:6379';
    });

    it('returns "new" the first time an id is seen and "duplicate" on replay', async () => {
        const { markWebhookSeen } = await import('../webhookDedupe');
        expect(await markWebhookSeen('evt-1:msg-1:sent')).toBe('new');
        expect(await markWebhookSeen('evt-1:msg-1:sent')).toBe('duplicate');
    });

    it('treats different statuses for the same message as distinct events', async () => {
        const { markWebhookSeen } = await import('../webhookDedupe');
        expect(await markWebhookSeen('evt-1:msg-1:sent')).toBe('new');
        expect(await markWebhookSeen('evt-1:msg-1:delivered')).toBe('new');
    });

    it('uses SET NX EX with the 7-day TTL', async () => {
        const { markWebhookSeen } = await import('../webhookDedupe');
        await markWebhookSeen('evt-2:msg-2:sent');
        expect(setMock).toHaveBeenCalledWith(
            'bird:webhook:seen:evt-2:msg-2:sent',
            '1',
            { NX: true, EX: 7 * 24 * 60 * 60 },
        );
    });

    it('fails open with "unknown" when CACHE_URL is unset', async () => {
        delete process.env.__TEST_CACHE_URL;
        const { markWebhookSeen } = await import('../webhookDedupe');
        expect(await markWebhookSeen('evt-3:msg-3:sent')).toBe('unknown');
        expect(setMock).not.toHaveBeenCalled();
    });

    it('fails open with "unknown" when the client throws', async () => {
        connectShouldThrow = true;
        const { markWebhookSeen } = await import('../webhookDedupe');
        expect(await markWebhookSeen('evt-4:msg-4:sent')).toBe('unknown');
    });

    it('clearWebhookSeen removes the marker so a retry is seen as new again', async () => {
        const { markWebhookSeen, clearWebhookSeen } = await import('../webhookDedupe');
        expect(await markWebhookSeen('evt-5:msg-5:sent')).toBe('new');
        await clearWebhookSeen('evt-5:msg-5:sent');
        expect(delMock).toHaveBeenCalledWith('bird:webhook:seen:evt-5:msg-5:sent');
        // After rollback, the same event id is treated as first-seen again.
        expect(await markWebhookSeen('evt-5:msg-5:sent')).toBe('new');
    });
});
