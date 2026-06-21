import Resend from "next-auth/providers/resend"
import type { NextAuthConfig } from "next-auth"
import { AuthEmail } from "./lib/email/templates/AuthEmail"
import { renderReactEmailToHtml } from "./lib/email/render"
import { env } from "./env.mjs"
import { isTestUserEmail } from "./lib/dev/test-users"
import { buildResendAuthErrorMessage } from "./lib/email/authError"

// In development, use port-specific session cookie names to allow multiple
// instances on different ports to have independent sessions. Without this,
// logging into one instance logs out the other because cookies are scoped
// by domain (localhost), not by port.
const isDev = process.env.NODE_ENV === 'development'
// APP_PORT is set by flake.nix when running multiple instances
const port = process.env.APP_PORT || '3000'

export default {
    trustHost: true,
    cookies: isDev ? {
        sessionToken: {
            name: `authjs.session-token-${port}`,
            options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: false },
        },
    } : undefined,
    providers: [Resend({
        from: env.AUTH_EMAIL_FROM,
        apiKey: env.RESEND_API_KEY,
        sendVerificationRequest: async (params) => {
            const { identifier: to, provider, url, theme } = params
            const html = await renderReactEmailToHtml(AuthEmail({ url }))

            // Redirect test user emails to DEV_EMAIL_OVERRIDE if set
            // This allows testing different admin roles with a single real inbox
            let emailTo = to
            if (env.DEV_EMAIL_OVERRIDE && isTestUserEmail(to)) {
                console.log(`[Auth] Redirecting test user email from ${to} to ${env.DEV_EMAIL_OVERRIDE}`)
                emailTo = env.DEV_EMAIL_OVERRIDE
            }

            const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${provider.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: provider.from,
                    to: emailTo,
                    subject: `Συνδεθείτε στο OpenCouncil`,
                    html,
                    text: `Συνδεθείτε στο OpenCouncil: ${url}`,
                }),
            })

            if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { name?: string; message?: string }
                const errorMessage = buildResendAuthErrorMessage({
                    status: res.status,
                    from: provider.from,
                    to: emailTo,
                    body,
                    statusText: res.statusText,
                })
                console.error(`[Auth][Resend] Failed to send sign-in email${body.name ? ` (${body.name})` : ''}: ${errorMessage}`)
                throw new Error(errorMessage)
            }
        }
    })],
} satisfies NextAuthConfig
