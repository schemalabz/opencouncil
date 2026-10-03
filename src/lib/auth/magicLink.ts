import "server-only";
import { signIn } from "@/auth";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { signInFailurePath } from "@/lib/auth/signInResult";

/**
 * Sends the magic link. `returnTo` is where it lands — the page the reader
 * was filling in, so an existing account costs them a tap rather than the
 * whole form. Anything that is not a same-origin relative path falls back to
 * the profile (safeRedirectPath), so the link can never carry a reader to
 * another origin.
 */
export async function sendMagicLink(email: string, returnTo?: string): Promise<boolean> {
    try {
        // This creates the user if they don't exist and sends a magic link.
        // redirect: false — with the default, Auth.js throws NEXT_REDIRECT on
        // success, so every sent magic link landed in the catch below and was
        // logged as a failure.
        const url: string = await signIn("resend", {
            email,
            ...(returnTo ? { redirectTo: safeRedirectPath(returnTo) } : {}),
            redirect: false,
        });
        const failurePath = signInFailurePath(url);
        if (failurePath) {
            console.error(`Magic link not sent to ${email} (redirected to ${failurePath})`);
            return false;
        }
        console.log(`Magic link sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Error sending magic link:', error);
        return false;
    }
}
