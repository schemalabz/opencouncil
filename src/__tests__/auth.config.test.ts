jest.mock('@/env.mjs', () => ({ env: { RESEND_API_KEY: 're_test' } }))
jest.mock('@/lib/email/render', () => ({
    renderReactEmailToHtml: jest.fn(async () => '<p>link</p>'),
}))
// next-auth ships ESM only. The stand-in keeps the shape that Auth.js's Resend()
// returns: the provider defaults at the top level, the app's config under `options`.
jest.mock('next-auth/providers/resend', () => ({
    __esModule: true,
    default: (options: Record<string, unknown>) => ({
        id: 'resend', type: 'email', name: 'Resend', from: 'Auth.js <no-reply@authjs.dev>', options,
    }),
}))

import type { EmailProviderSendVerificationRequestParams } from 'next-auth/providers/email'
import authConfig from '@/auth.config'

// Auth.js merges the provider's options over its defaults before it calls the handler.
function sendSignInEmail(identifier: string) {
    const provider = authConfig.providers[0]
    const params = {
        identifier,
        url: 'http://localhost:3000/api/auth/callback/resend?token=t',
        provider: { ...provider, ...provider.options },
        request: new Request('http://localhost:3000/api/auth/signin/resend'),
        expires: new Date(),
        token: 't',
        theme: {},
    } as unknown as EmailProviderSendVerificationRequestParams
    return provider.options!.sendVerificationRequest!(params)
}

function respondWith(response: Response) {
    const fetchMock = jest.fn(async (..._args: [RequestInfo | URL, RequestInit?]) => response)
    global.fetch = fetchMock as unknown as typeof fetch
    return fetchMock
}

describe('sign-in email (Resend provider)', () => {
    const realFetch = global.fetch
    afterEach(() => {
        global.fetch = realFetch
    })

    it('sends from the auth mailbox', async () => {
        const fetchMock = respondWith(new Response('{}', { status: 200 }))
        await sendSignInEmail('someone@real.org')
        const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
        expect(body.from).toBe('OpenCouncil <auth@opencouncil.gr>')
        expect(body.to).toBe('someone@real.org')
    })

    it("reports a failed send with the status and Resend's response as it is", async () => {
        const resendBody = JSON.stringify({
            name: 'validation_error',
            message: 'You can only send testing emails to your own email address (owner@real.org).',
        })
        respondWith(new Response(resendBody, { status: 403 }))
        await expect(sendSignInEmail('someone@real.org')).rejects.toThrow(
            `Resend error (403): ${resendBody} See docs/environment-variables.md#resend-setup-for-local-development`,
        )
    })

    it('reports a failed send whose response is not JSON', async () => {
        respondWith(new Response('<html>Bad Gateway</html>', { status: 502 }))
        await expect(sendSignInEmail('someone@real.org')).rejects.toThrow(
            'Resend error (502): <html>Bad Gateway</html>',
        )
    })
})
