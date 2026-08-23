import { handlers } from "@/auth"
import { withSessionMirror } from "@/lib/auth/sessionMirror"

// The mirror must ride the exact responses that set or clear the session
// cookie (magic-link callback, sign-out) — see sessionMirror.ts.
export const GET = withSessionMirror(handlers.GET)
export const POST = withSessionMirror(handlers.POST)
