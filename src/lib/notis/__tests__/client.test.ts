const mockEnv: { NOTIS_API_URL?: string; NOTIS_SERVICE_TOKEN?: string } = {};
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

import { getNotisSubscription, isNotisConfigured, setNotisSubscription } from '../client';

const ORIGINAL_FETCH = global.fetch;

function mockFetch(status: number, body: unknown): jest.Mock {
    const fn = jest.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    }));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
}

beforeEach(() => {
    mockEnv.NOTIS_API_URL = 'https://notis.test';
    mockEnv.NOTIS_SERVICE_TOKEN = 'token-token-token-token-token-token';
});

afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
});

describe('notis client', () => {
    it('reports unconfigured without touching the network', async () => {
        delete mockEnv.NOTIS_API_URL;
        const fetchMock = mockFetch(200, {});
        expect(isNotisConfigured()).toBe(false);
        expect(await getNotisSubscription('user1')).toEqual({ ok: false, reason: 'unconfigured' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reads a subscription with the bearer token, no cookies, no cache', async () => {
        const fetchMock = mockFetch(200, {
            subscription: { status: 'active', phone: '+306900000001', origin: 'signup', unsubscribedAt: null, createdAt: 'x' },
        });

        const result = await getNotisSubscription('user 1');

        expect(result).toEqual({ ok: true, data: expect.objectContaining({ status: 'active' }) });
        const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
        expect(url.toString()).toBe('https://notis.test/api/subscriptions/user%201');
        expect(init.method).toBe('GET');
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-token-token-token-token-token');
        expect(init.cache).toBe('no-store');
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('flips a status with a JSON body and returns what the row is now', async () => {
        const fetchMock = mockFetch(200, { subscription: null, next: 'poller' });

        const result = await setNotisSubscription('user1', 'active');

        expect(result).toEqual({ ok: true, data: { subscription: null, next: 'poller' } });
        const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
        expect(init.method).toBe('PATCH');
        expect(init.body).toBe(JSON.stringify({ status: 'active' }));
        expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    });

    it('surfaces a refusal with its status and code', async () => {
        mockFetch(409, { error: 'phone_in_use' });
        expect(await setNotisSubscription('user1', 'active')).toEqual({
            ok: false,
            reason: 'rejected',
            status: 409,
            code: 'phone_in_use',
        });
    });

    it('turns a network failure or a timeout into unreachable, never a throw', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        global.fetch = jest.fn(async () => {
            throw new Error('ECONNREFUSED');
        }) as unknown as typeof fetch;
        expect(await getNotisSubscription('user1')).toEqual({ ok: false, reason: 'unreachable' });
    });
});
