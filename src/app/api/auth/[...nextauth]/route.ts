import { NextRequest } from "next/server"
import { Auth } from "@auth/core"
import { authOptions, handlers } from "@/auth"
import { env } from "@/env.mjs"
import { realmOAuthUrl } from "@/lib/auth/realmAuthRequest"
import { withSessionMirror } from "@/lib/auth/sessionMirror"

/**
 * next-auth's handler, except for the Google routes on another realm's
 * apex: those run through Auth.js core on the host they arrived on, with the
 * same config, so a Google sign-in started on opencouncil.rs finishes there
 * (see realmOAuthUrl).
 */
function onOwnRealm(handler: (req: NextRequest) => Promise<Response>) {
    return (req: NextRequest): Promise<Response> => {
        const url = realmOAuthUrl(req.url, req.headers, env.NEXTAUTH_URL)
        return url ? Auth(new NextRequest(url, req), authOptions) : handler(req)
    }
}

// The mirror must ride the exact responses that set or clear the session
// cookie (magic-link callback, sign-out) — see sessionMirror.ts.
export const GET = withSessionMirror(onOwnRealm(handlers.GET))
export const POST = withSessionMirror(onOwnRealm(handlers.POST))
