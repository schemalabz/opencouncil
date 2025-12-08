import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserNotificationPreferences } from '@/lib/db/notifications';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const preferences = await getUserNotificationPreferences(currentUser.id);

        return NextResponse.json({ preferences });

    } catch (error) {
        console.error('Error fetching notification preferences:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

