import { NextRequest, NextResponse } from 'next/server';
import { getAdminRealms } from '@/lib/auth';
import { ForbiddenError, handleApiError } from '@/lib/api/errors';
import { getCityRealm } from '@/lib/db/cityRealm';
import { getNotificationMapData } from '@/lib/db/notifications';

export async function GET(request: NextRequest) {
    try {
        // The map shows the saved locations of readers: a realm admin's, as
        // the rest of the notifications tree, not a city admin's.
        const realms = await getAdminRealms();
        const searchParams = request.nextUrl.searchParams;
        const meetingId = searchParams.get('meetingId');
        const cityId = searchParams.get('cityId');

        if (!meetingId || !cityId) {
            return NextResponse.json(
                { error: 'meetingId and cityId are required' },
                { status: 400 }
            );
        }

        // A city right is not enough: an admin of one realm can also hold a
        // city of another realm.
        const realm = await getCityRealm(cityId);
        if (realms && (!realm || !realms.includes(realm))) {
            throw new ForbiddenError();
        }
        const result = await getNotificationMapData(meetingId, cityId);

        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch notification map data');
    }
}
