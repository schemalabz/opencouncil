/** @jest-environment node */
const mockSendContactEmail = jest.fn();
jest.mock('@/lib/email/contact', () => ({
    sendContactEmail: (...args: unknown[]) => mockSendContactEmail(...args),
}));
let forwardedFor = '203.0.113.7, 10.0.0.1';
jest.mock('next/headers', () => ({
    headers: async () => new Headers({ 'x-forwarded-for': forwardedFor }),
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
        forwardedFor = '198.51.100.1';
        const address = { ...FORM, contactEmail: 'Repeat@example.org' };
        // One send happened in the test above for maria@; this address is fresh.
        for (let i = 0; i < 3; i++) {
            forwardedFor = `198.51.100.${i + 1}`;
            expect((await submitContactForm(address)).success).toBe(true);
        }
        forwardedFor = '198.51.100.9';
        const refused = await submitContactForm({ ...address, contactEmail: 'repeat@example.org' });
        expect(refused).toEqual({ success: false, message: 'Too many requests' });
        expect(mockSendContactEmail).toHaveBeenCalledTimes(3);
    });

    it('stops one sender after five emails in an hour', async () => {
        forwardedFor = '192.0.2.44, 10.0.0.1';
        for (let i = 0; i < 5; i++) {
            expect((await submitContactForm({ ...FORM, contactEmail: `person${i}@example.org` })).success).toBe(true);
        }
        const refused = await submitContactForm({ ...FORM, contactEmail: 'person9@example.org' });
        expect(refused).toEqual({ success: false, message: 'Too many requests' });
        expect(mockSendContactEmail).toHaveBeenCalledTimes(5);
    });
});
