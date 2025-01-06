import NextAuth, { DefaultSession } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/db/prisma"
import authConfig from "@/auth.config"

declare module "next-auth" {
    interface Session {
        user: {
            isSuperAdmin?: boolean
        } & DefaultSession["user"]
    }

    interface User {
        isSuperAdmin?: boolean
        name?: string | null
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(prisma),
    callbacks: {
        session({ session, token, user }) {
            return {
                ...session,
                user: {
                    ...session.user,
                    isSuperAdmin: user.isSuperAdmin,
                    name: user.name
                }
            }
        }
    },
    ...authConfig,
})
