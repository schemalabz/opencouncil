const mockAlert = jest.fn(async (_: { title: string; description: string }) => {});
jest.mock('@/lib/discord-core', () => ({ sendAdminAlert: (data: { title: string; description: string }) => mockAlert(data) }));
const windows = new Set<string>();
const mockClaimWindow = jest.fn(async (key: string, _ttl: number) => {
    if (windows.has(key)) return false;
    windows.add(key);
    return true;
});
jest.mock('@/lib/cache/alertWindow', () => ({ claimAlertWindow: (key: string, ttl: number) => mockClaimWindow(key, ttl) }));

import { reportUnusualCodeRequest } from '../abuseAlerts';

beforeEach(() => {
    mockAlert.mockClear();
    windows.clear();
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
        expect(mockClaimWindow).toHaveBeenCalledWith('phone-verification:flood:+306900000001', 3600);

        await reportUnusualCodeRequest({ userId: 'u2', phone: '+306900000001', phoneSendCount: 5 });
        expect(mockAlert).toHaveBeenCalledTimes(2);
        expect(mockAlert.mock.calls[1][0].description).toBe('The number reached its cap of 5 codes an hour.');
    });

    it('alerts on a number outside the realm countries, with the number masked', async () => {
        await reportUnusualCodeRequest({ userId: 'u1', phone: '+491511234567', phoneSendCount: 1 });
        expect(mockAlert).toHaveBeenCalledTimes(1);
        const alert = JSON.stringify(mockAlert.mock.calls[0][0]);
        expect(alert).toContain('(DE)');
        expect(alert).not.toContain('1511234567');
    });
});
