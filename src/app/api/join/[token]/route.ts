import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { CLAIM_EMAIL_GRACE_MS, verifyJoinConfirmation, verifyPersonClaimToken } from '@/lib/auth/personClaim';
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
 * me" before asking for it. Signed in with that mark, the route claims the
 * person, so the page opens on the consent step. Without it nothing is
 * claimed, and the page asks first.
 *
 * Under /api because the path holds the code, the code holds a dot, and the
 * proxy skips every dotted path. Redirects are relative, so the reader
 * stays on the realm they arrived on, and the utm parameters ride along.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ token: string }> }) {
    const { token } = await props.params;
    const params = new URLSearchParams(req.nextUrl.searchParams);
    // Only the link in the sign-in email carries a mark the server signed; a
    // hand-typed `confirmed` claims nothing and extends nothing.
    const confirmed = verifyJoinConfirmation(token, params.get('confirmed'));
    params.delete('confirmed');

    // The email link may arrive after the code expired: the reader confirmed
    // in time, and must not be left with an account that is not linked.
    const personId = verifyPersonClaimToken(token, confirmed ? CLAIM_EMAIL_GRACE_MS : 0);
    const person = personId ? await getJoinPerson(personId) : null;
    if (!person) {
        params.set('claim', 'invalid');
        return relativeRedirect('/claim', params);
    }

    if (confirmed) {
        const user = await getCurrentUser();
        if (user) {
            const result = await claimPerson(user.id, person.id);
            if (result.status === 'linked') {
                sendPersonClaimedAdminAlert({ cityId: result.cityId, cityName: result.cityName, personName: result.personName });
            }
            params.set('step', '3');
        }
    }

    params.set('c', token);
    return relativeRedirect(`/${person.cityId}/join`, params);
}
