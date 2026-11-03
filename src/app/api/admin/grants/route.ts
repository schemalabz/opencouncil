import { NextRequest, NextResponse } from 'next/server';
import { getAdminRealms } from '@/lib/auth';
import { inviteGrant, listGrants, revokeGrant } from '@/lib/db/grants';
import { handleApiError } from '@/lib/api/errors';
import { inviteGrantRequestSchema, revokeGrantRequestSchema } from '@/lib/zod-schemas/user';

/**
 * The grants of the /admin/team page (#875). getAdminRealms gates the tree:
 * a superadmin or a realm admin passes, anyone else gets 401 or 403 before
 * the body is read. The grants module checks who may give or take each
 * grant (canGrant), and answers a refusal with a code of GRANT_ERROR_CODES.
 */

/** The grants in the viewer's reach. `cityId` narrows to one city; `includeRevoked=1` adds the revoked rows. */
export async function GET(request: NextRequest) {
    try {
        const realms = await getAdminRealms();
        const params = request.nextUrl.searchParams;
        const cityId = params.get('cityId') || undefined;
        const includeRevoked = ['1', 'true'].includes(params.get('includeRevoked') ?? '');
        return NextResponse.json(await listGrants({ realms, cityId, includeRevoked }));
    } catch (error) {
        return handleApiError(error, 'Failed to list the grants');
    }
}

/** Invite an account to a role on a scope, by email. A new email gets an account and a pending invite. */
export async function POST(request: NextRequest) {
    try {
        await getAdminRealms();
        const input = inviteGrantRequestSchema.parse(await request.json().catch(() => null));
        return NextResponse.json(await inviteGrant(input), { status: 201 });
    } catch (error) {
        return handleApiError(error, 'Failed to invite');
    }
}

/** Revoke a grant. The row stays, marked revoked. */
export async function DELETE(request: NextRequest) {
    try {
        await getAdminRealms();
        const { grantId } = revokeGrantRequestSchema.parse(await request.json().catch(() => null));
        await revokeGrant(grantId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return handleApiError(error, 'Failed to revoke the grant');
    }
}
