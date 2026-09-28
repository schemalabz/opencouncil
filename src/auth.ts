import NextAuth, { DefaultSession, type NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/db/prisma"
import authConfig from "@/auth.config"
import { isTrustedExternalRedirect } from "@/lib/auth/trustedRedirect"
import { signInAllowed } from "@/lib/auth/signInGuard"
import { usesSecureCookies } from "@/lib/auth/sessionMirror"
import { publishPendingConsultationComments } from "@/lib/db/consultationComments"

declare module "next-auth" {
    interface Session {
        user: {
            isSuperAdmin?: boolean
            phone?: string | null
        } & DefaultSession["user"]
    }

    interface User {
        isSuperAdmin?: boolean
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
    events: {
        /**
         * Opening a magic link proves the email address, which is what a comment written while
         * signed out was waiting for: publish it. A failure must not block the sign-in.
         */
        async signIn({ user }) {
            if (!user.id) return;
            try {
                const published = await publishPendingConsultationComments(user.id);
                if (published > 0) console.log(`Published ${published} pending consultation comment(s) for user ${user.id}`);
            } catch (error) {
                console.error('Failed to publish pending consultation comments:', error);
            }
        },
    },
    callbacks: {
        signIn({ account, profile }) {
            return signInAllowed(account, profile);
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
} satisfies NextAuthConfig

export const { handlers, signIn, signOut, auth } = NextAuth(authOptions)
