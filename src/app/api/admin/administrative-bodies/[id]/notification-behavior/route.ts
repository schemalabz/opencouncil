import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { updateNotificationBehavior } from '@/lib/db/administrativeBodies';

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    await withUserAuthorizedToEdit({});

    const body = await request.json();
    const { notificationBehavior } = body;

    if (!notificationBehavior || !['NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_AUTO', 'NOTIFICATIONS_APPROVAL'].includes(notificationBehavior)) {
        return NextResponse.json(
            { error: 'Valid notificationBehavior is required' },
            { status: 400 }
        );
    }

    const updatedBody = await updateNotificationBehavior(params.id, notificationBehavior);

    console.log(`Updated notification behavior for ${updatedBody.name} to ${notificationBehavior}`);

    return NextResponse.json(updatedBody);
}

