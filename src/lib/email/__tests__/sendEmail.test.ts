/** @jest-environment node */
const mockEnv: Record<string, string | undefined> = { RESEND_API_KEY: 're_test' };
jest.mock('@/env.mjs', () => ({ env: mockEnv }));
const mockSend = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })) }));

import { sendEmail } from '@/lib/email/resend';

const email = { from: 'operations' as const, to: 'clerk@example.org', subject: 'Πρακτικά', html: '<p/>' };

describe('sendEmail', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('reports a sent email', async () => {
        mockSend.mockResolvedValue({ data: { id: 'e1' }, error: null });
        expect(await sendEmail(email)).toEqual({ success: true, message: 'Email sent successfully' });
    });

    it.each(['validation_error', 'rate_limit_exceeded', 'invalid_from_address'])('reads a %s answer as a refusal: the email did not go out', async (name) => {
        mockSend.mockResolvedValue({ data: null, error: { name, message: 'refused' } });
        expect(await sendEmail(email)).toMatchObject({ success: false, outcome: 'rejected' });
    });

    // The SDK reports a request that got no answer as application_error
    it.each(['application_error', 'internal_server_error'])('reads a %s answer as an unknown outcome: the email may have gone out', async (name) => {
        mockSend.mockResolvedValue({ data: null, error: { name, message: 'Unable to fetch data. The request could not be resolved.' } });
        expect(await sendEmail(email)).toMatchObject({ success: false, outcome: 'unknown' });
    });

    it('reads a thrown error as an unknown outcome', async () => {
        mockSend.mockRejectedValue(new Error('socket hang up'));
        expect(await sendEmail(email)).toMatchObject({ success: false, outcome: 'unknown' });
    });
});
