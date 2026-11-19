import NextAuth, { DefaultSession, type NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/db/prisma"
import authConfig, { authProviders } from "@/auth.config"
import { isTrustedExternalRedirect } from "@/lib/auth/trustedRedirect"
import { signInAllowed } from "@/lib/auth/signInGuard"
import { claimMagicLinkSend } from "@/lib/auth/magicLinkLimit"
import { rateLimitedSignInPath } from "@/lib/auth/signInResult"
import { headers } from "next/headers"
import { usesSecureCookies } from "@/lib/auth/sessionMirror"
import { pendingCommentQuote } from "@/lib/db/consultationComments"

declare module "next-auth" {
    interface Session {
        user: {
            isSuperAdmin?: boolean
            phone?: string | null
        } & DefaultSession["user"]
    }

    interface User {
        isSuperAdmin?: boolean
        isMachine?: boolean
        name?: string | null
        phone?: string | null
    }
}

/**
 * The config both entry points share: next-auth's handlers, and the realm
 * route in src/app/api/auth/[...nextauth]/route.ts, which calls Auth.js core
 * with it directly. NextAuth fills in the secret and the base path on this
 * object when it starts, so the core call gets the same, finished config.
 */
export const authOptions = {
    adapter: PrismaAdapter(prisma),
    // next-auth derives this from NEXTAUTH_URL; the realm route (Auth.js core
    // on the request's own URL) would derive it from the forwarded protocol.
    // Said once here, both paths look for the same cookie names.
    useSecureCookies: usesSecureCookies(),
    callbacks: {
        async signIn({ user, account, profile, email }) {
            if (!signInAllowed(account, profile, user)) return false;
            // Auth.js asks here before it sends a magic link, from every entry
            // (the sign-in form, person join, a pending comment, signup, and
            // its own HTTP route), so the rate limit on the link lives here.
            // A refusal is a URL, which Auth.js reports like any failure.
            if (email?.verificationRequest && user.email) {
                const claim = await claimMagicLinkSend(user.email, await headers());
                if (!claim.ok) return rateLimitedSignInPath(claim.retryAfterMs);
            }
            return true;
        },
        /**
         * Auth.js resolves redirect targets against `NEXTAUTH_URL`'s origin
         * (next-auth rewrites every request's URL to it — `reqWithEnvURL`), so
         * the default callback treats a perfectly valid opencouncil.rs target as
         * cross-origin and drops the user on opencouncil.gr. Allow our other realm
         * domains through, so a sign-in that started on .rs/.fr finishes there.
         *
         * Deliberately narrower than `isKnownRealmHost`, which also matches every
         * subdomain: `data.opencouncil.gr` is the Spaces bucket, and letting our own
         * auth endpoint redirect to attacker-uploaded content there would be an open
         * redirect with our name on it. The allowlist (production apexes and the
         * Notis admin hosts, https only) lives in isTrustedExternalRedirect —
         * previews and localhost still work, via the same-origin branch.
         */
        redirect({ url, baseUrl }) {
            if (url.startsWith('/')) return `${baseUrl}${url}`;
            try {
                const { origin } = new URL(url);
                if (origin === baseUrl) return url;
                if (isTrustedExternalRedirect(url)) return url;
            } catch {
                // malformed URL — fall through to the safe default
            }
            return baseUrl;
        },
        session({ session, token, user }) {
            return {
                ...session,
                user: {
                    ...session.user,
                    isSuperAdmin: user.isSuperAdmin,
                    name: user.name,
                    phone: user.phone
                }
            }
        }
    },
    ...authConfig,
    // The same providers as the proxy's, plus the quote of the comment a confirmation link publishes.
    providers: authProviders(pendingCommentQuote),
} satisfies NextAuthConfig

export const { handlers, signIn, signOut, auth } = NextAuth(authOptions)
