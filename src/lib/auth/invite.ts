import "server-only";
import type { GrantRole, Realm } from "@prisma/client";
import { render } from "@react-email/render";
import { UserInviteEmail } from "@/lib/email/templates/user-invite";
import { emailLocaleForRealm } from "@/lib/email/emailLocale";
import { sendEmail } from "@/lib/email/resend";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";

/**
 * The email that tells a person about a grant (#875). A pending invite asks
 * them to sign in with the address, which takes the grant up (see
 * acceptPendingGrants); a notice tells a holder who signed in before that
 * the grant is in force. An invite with no grant (the users page) only asks
 * them to sign in.
 */
export type InviteEmail = {
    email: string;
    name: string | null;
    /**
     * The realm whose domain and language the email takes: the realm of the
     * scope's city, or of a realm grant. Null keeps the deployment host, for
     * an account with no grant. A session cookie is host-only in production,
     * so the link must land on the domain the person will work on.
     */
    realm: Realm | null;
    /** Who sent it, as the email names them; null when nobody did (a resend by the system). */
    invitedBy: string | null;
    /** What the email is about; absent for an invite with no grant. */
    grant?: {
        role: GrantRole;
        /** The scope as the email names it: "Chania", "Youth Council, Chania". */
        scopeName: string;
        /** The page of the scope, relative to the realm's base URL. */
        path: string;
    };
    /** Whether the person has to sign in to take the grant up. */
    pending: boolean;
};

/** The page the invite link opens, on the realm's domain: the sign-in page with the address filled in. */
export function inviteLink(email: string, realm: Realm | null, path = '/'): string {
    const params = new URLSearchParams({ email });
    if (path !== '/') params.set('callbackUrl', path);
    return `${realmBaseUrl(realm)}/sign-in?${params.toString()}`;
}

/** The link of the email: the sign-in page for a pending invite, the scope's own page for a notice. */
export function inviteEmailLink(input: Pick<InviteEmail, 'email' | 'realm' | 'grant' | 'pending'>): string {
    const path = input.grant?.path ?? '/';
    return input.pending ? inviteLink(input.email, input.realm, path) : `${realmBaseUrl(input.realm)}${path}`;
}

/** Send the email. False when it could not be sent: the caller keeps the grant and says so. */
export async function sendInviteEmail(input: InviteEmail): Promise<boolean> {
    try {
        const locale = emailLocaleForRealm(input.realm);
        const email = UserInviteEmail({
            locale,
            realm: input.realm,
            email: input.email,
            name: input.name || input.email,
            invitedBy: input.invitedBy,
            grant: input.grant,
            pending: input.pending,
            url: inviteEmailLink(input),
        });
        const result = await sendEmail({
            from: 'auth',
            to: input.email,
            subject: email.subject,
            html: await render(email.element),
        });
        if (!result.success) throw new Error("Email send failed");
        return true;
    } catch (error) {
        console.error("Failed to send invite email:", error);
        return false;
    }
}
