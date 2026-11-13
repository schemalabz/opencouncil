/** @jest-environment node */
import { submitContactForm } from '../contact';

const mockSendContactEmail = jest.fn();
const mockAlert = jest.fn();
let clientAddress = '203.0.113.7';
jest.mock('@/lib/email/contact', () => ({
    sendContactEmail: (...args: unknown[]) => mockSendContactEmail(...args),
}));
jest.mock('next/headers', () => ({
    headers: async () => new Headers({ 'do-connecting-ip': clientAddress }),
}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_SECRET: 'test-secret' } }));
// No Valkey: the real limiter counts in this process, as on a preview.
jest.mock('@/lib/cache/valkey', () => ({ isCacheConfigured: () => false, cacheIncrWindow: jest.fn() }));
jest.mock('@/lib/cache/alertWindow', () => ({ claimAlertWindow: async () => true }));
jest.mock('@/lib/discord-core', () => ({ sendAdminAlert: (...args: unknown[]) => mockAlert(...args) }));

const FORM = {
    contactName: ' Maria ',
    contactPosition: 'Mayor',
    contactEmail: 'maria@example.org',
    contactMunicipality: 'Athens',
    contactPhone: '',
    calculatedPrice: 1200,
};

// The counts live for the whole file, so each test uses its own clients and addresses.
function submitFrom(ip: string, contactEmail: string) {
    clientAddress = ip;
    return submitContactForm({ ...FORM, contactEmail });
}

beforeEach(() => {
    mockSendContactEmail.mockReset();
    mockSendContactEmail.mockResolvedValue({ success: true, message: 'sent' });
    mockAlert.mockReset();
});

describe('submitContactForm', () => {
    it('refuses an invalid address before it sends or counts anything', async () => {
        for (let i = 0; i < 6; i++) {
            expect((await submitFrom('192.0.2.1', 'not-an-address')).success).toBe(false);
        }
        expect(mockSendContactEmail).not.toHaveBeenCalled();
        // Six invalid submissions used none of the five this client has.
        expect((await submitFrom('192.0.2.1', 'valid@example.org')).success).toBe(true);
    });

    it('refuses an oversized field', async () => {
        const result = await submitContactForm({ ...FORM, contactName: 'x'.repeat(201) });
        expect(result.success).toBe(false);
        expect(mockSendContactEmail).not.toHaveBeenCalled();
    });

    it('sends the trimmed fields and reports success', async () => {
        const result = await submitFrom('192.0.2.2', 'maria@example.org');
        expect(result).toEqual({ success: true });
        expect(mockSendContactEmail).toHaveBeenCalledWith(expect.objectContaining({ contactName: 'Maria', calculatedPrice: 1200 }));
    });

    it('stops one address after three emails in an hour, from any client', async () => {
        for (let i = 0; i < 3; i++) {
            expect((await submitFrom(`198.51.100.${i + 1}`, 'Repeat@example.org')).success).toBe(true);
        }
        const refused = await submitFrom('198.51.100.9', 'repeat@example.org');
        expect(refused).toEqual({ success: false, message: 'Too many requests' });
        expect(mockSendContactEmail).toHaveBeenCalledTimes(3);
        await new Promise((resolve) => setImmediate(resolve));
        expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '🚦 Rate limit reached: contact-form' }));
    });

    it('stops one client after five emails in an hour, to any address', async () => {
        for (let i = 0; i < 5; i++) {
            expect((await submitFrom('192.0.2.44', `person${i}@example.org`)).success).toBe(true);
        }
        const refused = await submitFrom('192.0.2.44', 'person9@example.org');
        expect(refused).toEqual({ success: false, message: 'Too many requests' });
        expect(mockSendContactEmail).toHaveBeenCalledTimes(5);
    });

    it('does not use up the count of an address when the client is refused', async () => {
        for (let i = 0; i < 5; i++) await submitFrom('192.0.2.55', `filler${i}@example.org`);
        // This client is past its cap. Its tries at another address count nothing for that address.
        for (let i = 0; i < 5; i++) {
            expect((await submitFrom('192.0.2.55', 'owner@example.org')).success).toBe(false);
        }
        expect((await submitFrom('192.0.2.56', 'owner@example.org')).success).toBe(true);
    });
});
