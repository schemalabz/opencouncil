import { createHash } from 'node:crypto';
const mockAlert = jest.fn(async (_: { title: string; description: string }) => {});
jest.mock('@/lib/discord-core', () => ({ sendAdminAlert: (data: { title: string; description: string }) => mockAlert(data) }));
const windows = new Set<string>();
const mockClaimWindow = jest.fn(async (key: string, _ttl: number) => {
    if (windows.has(key)) return false;
    windows.add(key);
    return true;
});
const mockEnv = { NEXTAUTH_SECRET: 'test-secret' };
jest.mock('@/env.mjs', () => ({ env: mockEnv }));
jest.mock('@/lib/cache/alertWindow', () => ({ claimAlertWindow: (key: string, ttl: number) => mockClaimWindow(key, ttl) }));

import { reportUnusualCodeRequest } from '../abuseAlerts';

beforeEach(() => {
    mockAlert.mockClear();
    mockClaimWindow.mockClear();
    windows.clear();
    mockEnv.NEXTAUTH_SECRET = 'test-secret';
});

describe('reportUnusualCodeRequest', () => {
    it('says nothing about the first codes to a Greek number', async () => {
        await reportUnusualCodeRequest({ userId: 'u1', phone: '+306900000001', phoneSendCount: 1 });
        await reportUnusualCodeRequest({ userId: 'u1', phone: '+306900000001', phoneSendCount: 2 });
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('alerts on the third code once per number per window, even when the count skips it', async () => {
        // A refused third send still sat in the count when the fourth went out.
        await reportUnusualCodeRequest({ userId: 'u1', phone: '+306900000001', phoneSendCount: 4 });
        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(mockAlert.mock.calls[0][0].description).toContain('3rd code');
        // One window per number, keyed by a keyed hash so the number stays out of the cache's logs.
        expect(mockClaimWindow).toHaveBeenCalledWith(expect.stringMatching(/^phone-verification:flood:[0-9a-f]{16}$/), 3600);
        expect(mockClaimWindow.mock.calls[0][0]).not.toContain('6900000001');
        // Not a plain SHA-256, which anyone can recompute for every number.
        expect(mockClaimWindow.mock.calls[0][0]).not.toContain(createHash('sha256').update('+306900000001').digest('hex').slice(0, 16));

        await reportUnusualCodeRequest({ userId: 'u2', phone: '+306900000001', phoneSendCount: 5 });
        expect(mockAlert).toHaveBeenCalledTimes(2);
        expect(mockAlert.mock.calls[1][0].description).toBe('The number reached its cap of 5 codes an hour.');
    });

    it('alerts on a number outside the realm countries, with the number masked', async () => {
        await reportUnusualCodeRequest({ userId: 'u1', phone: '+819012345678', phoneSendCount: 1 });
        expect(mockAlert).toHaveBeenCalledTimes(1);
        const alert = JSON.stringify(mockAlert.mock.calls[0][0]);
        expect(alert).toContain('(JP)');
        expect(alert).not.toContain('9012345678');
    });

    it('gives each number its own window', async () => {
        await reportUnusualCodeRequest({ userId: 'u1', phone: '+306900000001', phoneSendCount: 3 });
        await reportUnusualCodeRequest({ userId: 'u2', phone: '+306900000002', phoneSendCount: 3 });
        expect(mockAlert).toHaveBeenCalledTimes(2);
    });

    it('keys the window with the server secret, so nobody can recompute the key without it', async () => {
        await reportUnusualCodeRequest({ userId: 'u1', phone: '+306900000001', phoneSendCount: 3 });
        mockEnv.NEXTAUTH_SECRET = 'another-secret';
        await reportUnusualCodeRequest({ userId: 'u1', phone: '+306900000001', phoneSendCount: 3 });
        const [first, second] = mockClaimWindow.mock.calls.map(([key]) => key);
        expect(second).not.toBe(first);
    });
});
