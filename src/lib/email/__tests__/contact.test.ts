/** @jest-environment node */
const mockSendEmail = jest.fn();
jest.mock('../resend', () => ({ sendEmail: (...args: unknown[]) => mockSendEmail(...args) }));

import { sendContactEmail } from '../contact';

beforeEach(() => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true, message: 'sent' });
});

describe('sendContactEmail', () => {
    it('places the typed fields in the email as text, not as markup', async () => {
        await sendContactEmail({
            contactName: '<img src=x onerror=alert(1)>',
            contactPosition: 'Mayor & "friend"',
            contactEmail: 'maria@example.org',
            contactMunicipality: 'Athens',
        });
        const { html } = mockSendEmail.mock.calls[0][0];
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).toContain('Mayor &amp; &quot;friend&quot;');
    });

    it('refuses an invalid phone number without sending', async () => {
        const result = await sendContactEmail({
            contactName: 'Maria',
            contactPosition: 'Mayor',
            contactEmail: 'maria@example.org',
            contactMunicipality: 'Athens',
            contactPhone: 'abc',
        });
        expect(result).toEqual({ success: false, message: 'Invalid phone number' });
        expect(mockSendEmail).not.toHaveBeenCalled();
    });
});
