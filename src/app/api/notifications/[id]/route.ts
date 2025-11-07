import { NextRequest, NextResponse } from 'next/server';
import { getNotificationForView } from '@/lib/db/notifications';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const notification = await getNotificationForView(params.id);

        if (!notification) {
            return NextResponse.json(
                { error: 'Notification not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(notification);

    } catch (error) {
        console.error('Error fetching notification:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

