import Resend from "next-auth/providers/resend"
import Google from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"
import { AuthEmail, authEmailCopy } from "./lib/email/templates/AuthEmail"
import { renderReactEmailToHtml } from "./lib/email/render"
import { env } from "./env.mjs"
import { isTestUserEmail } from "./lib/dev/test-users"
import { signInUrlForRequest } from "./lib/auth/signInUrl"
import { localeForRequest } from "./lib/auth/requestLocale"
import { devSessionCookieName } from "./lib/auth/sessionMirror"
import { googleSignInConfigured } from "./lib/auth/googleSignIn"

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
            name: devSessionCookieName(port),
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
            // Write the email in the language of the domain it was requested
            // from — opencouncil.rs users were getting a Greek magic link.
            const locale = localeForRequest(request)
            const copy = authEmailCopy(locale)
            const html = await renderReactEmailToHtml(AuthEmail({ url: signInUrl, locale }))

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
                    subject: copy.subject,
                    html,
                    text: `${copy.subject}: ${signInUrl}`,
                }),
            })

            if (!res.ok)
                throw new Error("Resend error: " + JSON.stringify(await res.json()))
        }
    }),
    // Without a client the provider is absent, so the sign-in page hides the
    // button (googleSignInAvailable) and Auth.js never advertises it.
    ...(googleSignInConfigured() ? [Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        // Every user so far signed in by magic link and has no Account row, so
        // the first Google sign-in must link by email or it fails with
        // OAuthAccountNotLinked. Safe because the signIn callback (src/auth.ts)
        // admits only a verified Google email.
        allowDangerousEmailAccountLinking: true,
    })] : []),
    ],
    // Our own page for both, so an expired magic link or a refused Google
    // sign-in shows a translated message instead of Auth.js's bare page.
    // signInFailurePath knows this shape.
    pages: {
        signIn: '/sign-in',
        error: '/sign-in',
    },
} satisfies NextAuthConfig
