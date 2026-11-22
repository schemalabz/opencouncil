/** @jest-environment node */
const mockSendContactEmail = jest.fn();
jest.mock('@/lib/email/contact', () => ({
    sendContactEmail: (...args: unknown[]) => mockSendContactEmail(...args),
}));
let requestHeaders: Record<string, string> = { 'do-connecting-ip': '203.0.113.7' };
jest.mock('next/headers', () => ({
    headers: async () => new Headers(requestHeaders),
}));

import { submitContactForm } from '../contact';

const FORM = {
    contactName: ' Maria ',
    contactPosition: 'Mayor',
    contactEmail: 'maria@example.org',
    contactMunicipality: 'Athens',
    contactPhone: '',
    calculatedPrice: 1200,
};

beforeEach(() => {
    mockSendContactEmail.mockReset();
    mockSendContactEmail.mockResolvedValue({ success: true, message: 'sent' });
});

describe('submitContactForm', () => {
    it('refuses an invalid address before it sends anything', async () => {
        const result = await submitContactForm({ ...FORM, contactEmail: 'not-an-address' });
        expect(result.success).toBe(false);
        expect(mockSendContactEmail).not.toHaveBeenCalled();
    });

    it('refuses an oversized field', async () => {
        const result = await submitContactForm({ ...FORM, contactName: 'x'.repeat(201) });
        expect(result.success).toBe(false);
        expect(mockSendContactEmail).not.toHaveBeenCalled();
    });

    it('sends the trimmed fields and reports success', async () => {
        const result = await submitContactForm(FORM);
        expect(result).toEqual({ success: true });
        expect(mockSendContactEmail).toHaveBeenCalledWith(expect.objectContaining({ contactName: 'Maria', calculatedPrice: 1200 }));
    });

    it('stops one address after three emails in an hour', async () => {
        const address = { ...FORM, contactEmail: 'Repeat@example.org' };
        // Three senders, so that only the limit per address applies.
        for (let i = 0; i < 3; i++) {
            requestHeaders = { 'do-connecting-ip': `198.51.100.${i + 1}` };
            expect((await submitContactForm(address)).success).toBe(true);
        }
        requestHeaders = { 'do-connecting-ip': '198.51.100.9' };
        const refused = await submitContactForm({ ...address, contactEmail: 'repeat@example.org' });
        expect(refused).toEqual({ success: false, message: 'Too many requests' });
        expect(mockSendContactEmail).toHaveBeenCalledTimes(3);
    });

    it('stops one sender after five emails in an hour, whatever X-Forwarded-For it sends', async () => {
        for (let i = 0; i < 5; i++) {
            requestHeaders = { 'do-connecting-ip': '192.0.2.44', 'x-forwarded-for': `10.9.9.${i}` };
            expect((await submitContactForm({ ...FORM, contactEmail: `person${i}@example.org` })).success).toBe(true);
        }
        requestHeaders = { 'do-connecting-ip': '192.0.2.44', 'x-forwarded-for': '10.9.9.99' };
        const refused = await submitContactForm({ ...FORM, contactEmail: 'person9@example.org' });
        expect(refused).toEqual({ success: false, message: 'Too many requests' });
        expect(mockSendContactEmail).toHaveBeenCalledTimes(5);
    });

    it('counts one IPv6 /64 block as one sender, whatever address in it a request uses', async () => {
        for (let i = 0; i < 5; i++) {
            requestHeaders = { 'do-connecting-ip': `2001:db8:aa:bb::${i + 1}` };
            expect((await submitContactForm({ ...FORM, contactEmail: `six${i}@example.org` })).success).toBe(true);
        }
        requestHeaders = { 'do-connecting-ip': '2001:db8:aa:bb:ffff::99' };
        expect(await submitContactForm({ ...FORM, contactEmail: 'six9@example.org' })).toEqual({ success: false, message: 'Too many requests' });
        requestHeaders = { 'do-connecting-ip': '2001:db8:aa:cc::1' };
        expect((await submitContactForm({ ...FORM, contactEmail: 'other@example.org' })).success).toBe(true);
    });

    it('counts requests without the edge header as one sender', async () => {
        for (let i = 0; i < 5; i++) {
            requestHeaders = { 'x-forwarded-for': `10.8.8.${i}` };
            expect((await submitContactForm({ ...FORM, contactEmail: `local${i}@example.org` })).success).toBe(true);
        }
        requestHeaders = { 'x-forwarded-for': '10.8.8.99' };
        expect(await submitContactForm({ ...FORM, contactEmail: 'local9@example.org' })).toEqual({ success: false, message: 'Too many requests' });
    });
});
