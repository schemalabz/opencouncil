import { buildResendAuthErrorMessage } from '@/lib/email/authError'

describe('buildResendAuthErrorMessage', () => {
    it('adds a domain-verification hint for 403 responses (unverified "from")', () => {
        const msg = buildResendAuthErrorMessage({
            status: 403,
            from: 'OpenCouncil <auth@opencouncil.gr>',
            to: 'dev@example.org',
            body: { name: 'validation_error', message: 'The opencouncil.gr domain is not verified.' },
        })
        expect(msg).toContain('Resend error (403)')
        expect(msg).toContain('The opencouncil.gr domain is not verified.')
        expect(msg).toContain('AUTH_EMAIL_FROM')
        expect(msg).toContain('onboarding@resend.dev')
        expect(msg).toContain('OpenCouncil <auth@opencouncil.gr>')
        // Resend's message ends with a period; ours adds one — guard against ".."
        expect(msg).not.toContain('..')
    })

    it('adds a recipient hint for 422 responses (placeholder domains)', () => {
        const msg = buildResendAuthErrorMessage({
            status: 422,
            from: 'OpenCouncil <onboarding@resend.dev>',
            to: 'example@example.com',
            body: { message: 'Use our testing email address instead of domains like example.com.' },
        })
        expect(msg).toContain('Resend error (422)')
        expect(msg).toContain('example@example.com')
        expect(msg).toContain('DEV_EMAIL_OVERRIDE')
    })

    it('falls back to statusText when no Resend message is present', () => {
        const msg = buildResendAuthErrorMessage({
            status: 500,
            from: 'OpenCouncil <onboarding@resend.dev>',
            to: 'dev@example.org',
            statusText: 'Internal Server Error',
        })
        expect(msg).toBe('Resend error (500): Internal Server Error.')
    })
})
