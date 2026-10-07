import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { CLAIM_EMAIL_GRACE_MS, JOIN_NONCE_COOKIE, verifyJoinConfirmation, verifyPersonClaimToken } from '@/lib/auth/personClaim';
import { claimPerson, getJoinPerson } from '@/lib/db/personClaim';
import { sendPersonClaimedAdminAlert } from '@/lib/discord';
import { relativeRedirect } from '@/lib/utils/relativeRedirect';

/**
 * The way into the join flow for a link that carries the code in its path:
 * the link in the sign-in email, and any QR printed before the code moved
 * to the query. The flow itself is the page at /{cityId}/join, which
 * renders from the code and the session; this route only gets people there.
 *
 * `confirmed` marks the link in the email: the scanner said "yes, this is
 * me" before asking for it. Signed in as the address the email went to, with
 * that mark, the route claims the person, so the page opens on the consent
 * step. Without it nothing is claimed, and the page asks first. The Google
 * way in carries the same mark over a nonce, which the browser that pressed
 * the button holds as a cookie (see `startJoinGoogle`).
 *
 * Under /api because the path holds the code, the code holds a dot, and the
 * proxy skips every dotted path. Redirects are relative, so the reader
 * stays on the realm they arrived on, and the utm parameters ride along.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ token: string }> }) {
    const { token } = await props.params;
    const params = new URLSearchParams(req.nextUrl.searchParams);
    // Only the link in the sign-in email and the Google return path carry a
    // mark the server signed: over the address of that email, or over the
    // nonce this browser holds. A hand-typed `confirmed`, or a link copied
    // into another account's browser, claims nothing and extends nothing.
    // A scan carries no mark, and does not read the session.
    const marker = params.get('confirmed');
    const user = marker ? await getCurrentUser() : null;
    const nonce = req.cookies.get(JOIN_NONCE_COOKIE)?.value ?? null;
    const confirmedByEmail = user !== null && verifyJoinConfirmation(token, marker, user.email);
    const confirmedByNonce = !confirmedByEmail && user !== null && nonce !== null && verifyJoinConfirmation(token, marker, nonce);
    const confirmed = confirmedByEmail || confirmedByNonce;
    params.delete('confirmed');

    // The email link may arrive after the code expired: the reader confirmed
    // in time, and must not be left with an account that is not linked.
    const personId = verifyPersonClaimToken(token, confirmed ? CLAIM_EMAIL_GRACE_MS : 0);
    const person = personId ? await getJoinPerson(personId) : null;
    if (!person) {
        params.set('claim', 'invalid');
        return relativeRedirect('/claim', params);
    }

    if (user && confirmed) {
        const result = await claimPerson(user.id, person.id);
        if (result.status === 'linked') {
            sendPersonClaimedAdminAlert({ cityId: result.cityId, cityName: result.cityName, personName: result.personName });
        }
        params.set('step', '3');
    }

    params.set('c', token);
    const response = relativeRedirect(`/${person.cityId}/join`, params);
    // The nonce is for one return, and only that return spends it. A scan
    // or an email link opened in another tab while Google is still pending
    // passes through here too, and must leave the pending return its nonce.
    if (confirmedByNonce) response.cookies.set(JOIN_NONCE_COOKIE, '', { path: '/api/join', maxAge: 0 });
    return response;
}
