const mockEnv: Record<string, string | undefined> = {};
jest.mock('@/env.mjs', () => ({ env: mockEnv }));
const mockAlert = jest.fn(async (_: { source: string; error: string }) => {});
jest.mock('@/lib/discord-core', () => ({ sendErrorAdminAlert: (data: { source: string; error: string }) => mockAlert(data) }));
let mockWindowOpen = true;
const mockClaimWindow = jest.fn(async (_key: string, _ttl: number) => mockWindowOpen);
jest.mock('@/lib/cache/alertWindow', () => ({ claimAlertWindow: (key: string, ttl: number) => mockClaimWindow(key, ttl) }));
// The real catalogs, so the test reads the SMS a reader gets.
jest.mock('next-intl/server', () => ({
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
        const catalog = require(`../../../../messages/${locale}/${namespace}.json`) as Record<string, string>;
        return (key: string, values: Record<string, string | number> = {}) =>
            catalog[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
    },
}));

import { isSmsConfigured, sendVerificationSms, verificationSmsText } from '../sms';

const ORIGINAL_FETCH = global.fetch;

function mockFetch(status: number, body: unknown): jest.Mock {
    const fn = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
}

beforeEach(() => {
    mockEnv.BIRD_API_KEY = 'key';
    mockEnv.BIRD_WORKSPACE_ID = 'ws-1';
    mockEnv.BIRD_SMS_CHANNEL_ID = 'sms-1';
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
});

describe('verification SMS', () => {
    it('names the code and how long it lasts, in the reader\'s language', async () => {
        expect(await verificationSmsText('482913', 'el')).toBe('482913 είναι ο κωδικός επαλήθευσης για το OpenCouncil. Ισχύει για 10 λεπτά.');
        expect(await verificationSmsText('482913', 'en')).toContain('482913 is your OpenCouncil verification code');
        expect(await verificationSmsText('482913', 'fr')).toContain('482913 est votre code de vérification OpenCouncil');
        expect(await verificationSmsText('482913', 'sr')).toContain('482913 је ваш код за потврду за OpenCouncil');
    });

    it('posts one text message to the SMS channel with the access key', async () => {
        const fetchMock = mockFetch(202, { id: 'm1', status: 'accepted' });

        expect(await sendVerificationSms('+306900000001', '482913', 'el')).toEqual({ ok: true });

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.bird.com/workspaces/ws-1/channels/sms-1/messages');
        expect((init.headers as Record<string, string>).Authorization).toBe('AccessKey key');
        expect(JSON.parse(init.body as string)).toEqual({
            receiver: { contacts: [{ identifierValue: '+306900000001' }] },
            body: { type: 'text', text: { text: await verificationSmsText('482913', 'el') } },
        });
    });

    it('is unconfigured without the three Bird values, and touches no network', async () => {
        delete mockEnv.BIRD_SMS_CHANNEL_ID;
        const fetchMock = mockFetch(202, {});
        expect(isSmsConfigured()).toBe(false);
        expect(await sendVerificationSms('+306900000001', '482913', 'el')).toEqual({ ok: false, reason: 'unconfigured' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a refusal, also one inside a 2xx body, and never logs the number', async () => {
        mockFetch(422, { title: 'bad' });
        expect(await sendVerificationSms('+306900000001', '482913', 'el')).toEqual({ ok: false, reason: 'rejected' });
        mockFetch(200, { id: 'm1', status: 'rejected' });
        expect(await sendVerificationSms('+306900000001', '482913', 'el')).toEqual({ ok: false, reason: 'rejected' });
        expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain('6900000001');
    });

    it('does not count a 2xx without Bird\'s message id as sent', async () => {
        // An HTML error page from a proxy parses to nothing; an empty JSON body has no receipt.
        mockFetch(200, null);
        expect(await sendVerificationSms('+306900000001', '482913', 'el')).toEqual({ ok: false, reason: 'rejected' });
        mockFetch(200, {});
        expect(await sendVerificationSms('+306900000001', '482913', 'el')).toEqual({ ok: false, reason: 'rejected' });
    });

    it('alerts the operators on a failure, inside the shared window and without the number', async () => {
        mockAlert.mockClear();
        mockFetch(500, {});

        mockWindowOpen = true;
        await sendVerificationSms('+306900000001', '482913', 'el');
        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(mockAlert.mock.calls[0][0].source).toBe('Phone verification SMS');
        expect(JSON.stringify(mockAlert.mock.calls)).not.toContain('6900000001');
        expect(mockClaimWindow).toHaveBeenLastCalledWith('phone-verification:sms-alert', 600);

        // The window is taken, here or in another container: no second alert.
        mockWindowOpen = false;
        await sendVerificationSms('+306900000001', '482913', 'el');
        expect(mockAlert).toHaveBeenCalledTimes(1);
    });

    it('turns a network failure into unreachable, never a throw', async () => {
        global.fetch = jest.fn(async () => {
            throw new Error('ECONNREFUSED');
        }) as unknown as typeof fetch;
        expect(await sendVerificationSms('+306900000001', '482913', 'el')).toEqual({ ok: false, reason: 'unreachable' });
    });
});
