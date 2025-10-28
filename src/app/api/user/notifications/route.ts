import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserNotifications } from '@/lib/db/notifications';

export async function GET(request: NextRequest) {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const cityId = request.nextUrl.searchParams.get('cityId');

    if (!cityId) {
        return NextResponse.json(
            { error: 'cityId is required' },
            { status: 400 }
        );
    }

    const notifications = await getUserNotifications(currentUser.id, cityId);

    return NextResponse.json({ notifications });

}

