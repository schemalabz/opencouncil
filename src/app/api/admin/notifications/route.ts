import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getNotificationsForAdmin } from '@/lib/db/notifications';

export async function GET(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser?.isSuperAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Parse query parameters
        const searchParams = request.nextUrl.searchParams;
        const cityId = searchParams.get('cityId') || undefined;
        const status = searchParams.get('status') as 'pending' | 'sent' | 'failed' | undefined;
        const type = searchParams.get('type') as 'beforeMeeting' | 'afterMeeting' | undefined;
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        const notifications = await getNotificationsForAdmin({
            cityId,
            status,
            type,
            limit,
            offset
        });

        return NextResponse.json({
            notifications,
            count: notifications.length
        });

    } catch (error) {
        console.error('Error fetching admin notifications:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

