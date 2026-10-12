import Resend from "next-auth/providers/resend"
import Google, { type GoogleProfile } from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"
import { AuthEmail, authEmailCopy, authEmailPurpose } from "./lib/email/templates/AuthEmail"
import { renderReactEmailToHtml } from "./lib/email/render"
import { env } from "./env.mjs"
import { isTestUserEmail } from "./lib/dev/test-users"
import { signInUrlForRequest } from "./lib/auth/signInUrl"
import { localeForRequest } from "./lib/auth/requestLocale"
import { devSessionCookieName } from "./lib/auth/sessionMirror"
import { emailFrom } from "@/lib/email/senders"
import { googleSignInConfigured } from "@/lib/auth/googleSignIn"

// In development, use port-specific session cookie names to allow multiple
// instances on different ports to have independent sessions. Without this,
// logging into one instance logs out the other because cookies are scoped
// by domain (localhost), not by port.
const isDev = process.env.NODE_ENV === 'development'
// APP_PORT is set by flake.nix when running multiple instances
const port = process.env.APP_PORT || '3000'

/**
 * The magic-link provider. `quoteFor` adds the comment a confirmation link publishes to its email,
 * so the reader sees what they confirm; it reads the database, so only src/auth.ts (Node) passes it,
 * never the proxy.
 */
export function resendProvider(quoteFor?: (magicLinkUrl: string, email: string) => Promise<string | null>) {
    return Resend({
        from: emailFrom('auth'),
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
            // A link that publishes a comment the reader wrote while signed out asks for a confirmation.
            const purpose = authEmailPurpose(url)
            const copy = authEmailCopy(locale, purpose)
            let quote: string | null = null
            if (purpose === 'confirmComment' && quoteFor) {
                try {
                    quote = await quoteFor(url, to)
                } catch (error) {
                    // The link still works without the quote.
                    console.error('[Auth] Could not quote the pending comment:', error)
                }
            }
            const html = await renderReactEmailToHtml(AuthEmail({ url: signInUrl, locale, purpose, quote }))

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
                    text: quote ? `${copy.subject}\n\n«${quote}»\n\n${signInUrl}` : `${copy.subject}: ${signInUrl}`,
                }),
            })

            // Resend's own message names the cause, and one status code covers several
            // causes, so the body is passed on as it is. Auth.js logs the thrown error.
            if (!res.ok)
                throw new Error(`Resend error (${res.status}): ${await res.text()} See docs/environment-variables.md#resend-setup-for-local-development`)
        }
    })
}

/** Every sign-in provider; `quoteFor` goes to the magic-link provider (resendProvider). */
export function authProviders(quoteFor?: (magicLinkUrl: string, email: string) => Promise<string | null>) {
    return [
        resendProvider(quoteFor),
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
            // Keep only the link (provider + providerAccountId). Nothing calls
            // Google's APIs for the user, so the access and id tokens would sit
            // unread in the Account row: a credential leak waiting for a table leak.
            account: () => ({}),
            // Google's default profile also carries the picture URL. The User
            // model has no image column, and we do not want the browser to load
            // an avatar from Google on every page view. Keep name and email.
            profile: (profile: GoogleProfile) => ({ id: profile.sub, name: profile.name, email: profile.email }),
        })] : []),
    ];
}

export default {
    trustHost: true,
    cookies: isDev ? {
        sessionToken: {
            name: devSessionCookieName(port),
            options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: false },
        },
    } : undefined,
    providers: authProviders(),
    // Our own page for both, so an expired magic link or a refused Google
    // sign-in shows a translated message instead of Auth.js's bare page.
    // signInFailurePath knows this shape.
    pages: {
        signIn: '/sign-in',
        error: '/sign-in',
    },
} satisfies NextAuthConfig
