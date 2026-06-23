import Resend from "next-auth/providers/resend"
import type { NextAuthConfig } from "next-auth"
import { AuthEmail } from "./lib/email/templates/AuthEmail"
import { renderReactEmailToHtml } from "./lib/email/render"
import { env } from "./env.mjs"
import { isTestUserEmail } from "./lib/dev/test-users"
import { signInUrlForRequest } from "./lib/auth/signInUrl"

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
        from: 'OpenCouncil <auth@opencouncil.gr>',
        apiKey: env.RESEND_API_KEY,
        sendVerificationRequest: async (params) => {
            const { identifier: to, provider, url, request } = params
            // Point the magic link at the domain the user is signing in from
            // (opencouncil.gr vs opencouncil.fr) instead of the single build-time
            // NEXTAUTH_URL host, so the callback sets a cookie on the right domain.
            const signInUrl = signInUrlForRequest(url, request)
            const html = await renderReactEmailToHtml(AuthEmail({ url: signInUrl }))

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
                    text: `Συνδεθείτε στο OpenCouncil: ${signInUrl}`,
                }),
            })

            if (!res.ok)
                throw new Error("Resend error: " + JSON.stringify(await res.json()))
        }
    })],
} satisfies NextAuthConfig
