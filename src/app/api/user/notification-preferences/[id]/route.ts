import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteNotificationPreference, updateNotificationPreferenceChannels } from '@/lib/db/notifications';
import { handleApiError } from '@/lib/api/errors';

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { notifyByEmail, notifyByPhone } = body;

    try {
        const updated = await updateNotificationPreferenceChannels(params.id, currentUser.id, {
            ...(notifyByEmail !== undefined && { notifyByEmail }),
            ...(notifyByPhone !== undefined && { notifyByPhone }),
        });
        return NextResponse.json(updated);
    } catch (error) {
        return handleApiError(error, 'Failed to update notification preference');
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        await deleteNotificationPreference(params.id, currentUser.id);
    } catch (error) {
        return handleApiError(error, 'Failed to delete notification preference');
    }

    console.log(`User ${currentUser.email} deleted notification preference ${params.id}`);

    return NextResponse.json({ success: true });
}

