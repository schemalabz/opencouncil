import { NextRequest, NextResponse } from 'next/server';
import { getBodyClaimLinks } from '@/lib/db/bodyMembers';
import { handleApiError } from '@/lib/api/errors';

type Params = { params: Promise<{ cityId: string; bodyId: string }> };

/**
 * The claim links of the members who have no account yet (#829). Each call
 * mints new links; the old ones stay valid until they expire. For an admin of
 * the body or of its city.
 */
export async function GET(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        return NextResponse.json(await getBodyClaimLinks(cityId, bodyId));
    } catch (error) {
        return handleApiError(error, 'Failed to make the claim links');
    }
}
