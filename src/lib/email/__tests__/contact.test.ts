jest.mock('../resend', () => ({
    sendEmail: jest.fn(),
}));

import { sendEmail } from '../resend';
import { sendContactEmail } from '../contact';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

const form = {
    contactName: 'Maria',
    contactPosition: 'Director',
    contactEmail: 'maria@example.com',
    contactMunicipality: 'Chania',
};

function sentHtml(): string {
    return mockSendEmail.mock.calls[0][0].html;
}

describe('sendContactEmail', () => {
    beforeEach(() => {
        mockSendEmail.mockReset();
        mockSendEmail.mockResolvedValue({ success: true, message: 'Email sent successfully' });
    });

    it('sends a landline in E.164', async () => {
        const result = await sendContactEmail({ ...form, contactPhone: '+30 210 645 9454' });
        expect(result.success).toBe(true);
        expect(sentHtml()).toContain('<li>Τηλέφωνο: +302106459454</li>');
    });

    it('leaves out the phone line when the field is empty or holds only the dial code', async () => {
        await sendContactEmail({ ...form, contactPhone: '+30' });
        await sendContactEmail({ ...form, contactPhone: '' });
        await sendContactEmail(form);
        expect(mockSendEmail).toHaveBeenCalledTimes(3);
        for (const [params] of mockSendEmail.mock.calls) {
            expect(params.html).not.toContain('Τηλέφωνο');
        }
    });

    it('refuses an invalid phone without sending', async () => {
        const result = await sendContactEmail({ ...form, contactPhone: '+30 210 64<b>' });
        expect(result.success).toBe(false);
        expect(mockSendEmail).not.toHaveBeenCalled();
    });
});
