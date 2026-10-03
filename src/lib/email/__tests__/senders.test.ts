const mockEnv: { EMAIL_FROM_OVERRIDE?: string } = {};
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

import { emailFrom } from '@/lib/email/senders';

describe('emailFrom', () => {
    afterEach(() => {
        delete mockEnv.EMAIL_FROM_OVERRIDE;
    });

    it('sends each sender from its own opencouncil.gr mailbox', () => {
        expect(emailFrom('auth')).toBe('OpenCouncil <auth@opencouncil.gr>');
        expect(emailFrom('notifications')).toBe('OpenCouncil <notifications@opencouncil.gr>');
    });

    it('sends every sender from EMAIL_FROM_OVERRIDE when it is set', () => {
        mockEnv.EMAIL_FROM_OVERRIDE = 'Fork <onboarding@resend.dev>';
        expect(emailFrom('auth')).toBe('Fork <onboarding@resend.dev>');
        expect(emailFrom('noreply')).toBe('Fork <onboarding@resend.dev>');
    });
});
