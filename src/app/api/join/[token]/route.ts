import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { verifyPersonClaimToken } from '@/lib/auth/personClaim';
import { claimPerson, getClaimablePersonStatus } from '@/lib/db/personClaim';
import { sendPersonClaimedAdminAlert } from '@/lib/discord';
import { relativeRedirect } from '@/lib/utils/relativeRedirect';

/**
 * The link behind a councillor's QR. The code is checked first: an expired,
 * forged or spent code answers at once, without asking anyone to make an
 * account. A good code sends a signed-out scanner to sign in and back here
 * through the magic link; signed in, it links their account to the person
 * and lands on the profile, which says what happened. The incoming query
 * (the utm parameters of the QR) rides along on every redirect, so the first
 * page that renders records the scan.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ token: string }> }) {
    const { token } = await props.params;
    const params = new URLSearchParams(req.nextUrl.searchParams);
    const user = await getCurrentUser();

    const personId = verifyPersonClaimToken(token);
    if (!personId) {
        params.set('claim', 'invalid');
        return relativeRedirect(user ? '/profile' : '/claim', params);
    }

    if (!user) {
        const status = await getClaimablePersonStatus(personId);
        if (status !== 'claimable') {
            params.set('claim', status);
            return relativeRedirect('/claim', params);
        }
        params.set('callbackUrl', `/api/join/${token}`);
        return relativeRedirect('/sign-in', params);
    }

    const result = await claimPerson(user.id, personId);
    if (result.status === 'linked') {
        sendPersonClaimedAdminAlert({ cityId: result.cityId, cityName: result.cityName, personName: result.personName });
    }

    params.set('claim', result.status);
    return relativeRedirect('/profile', params);
}
