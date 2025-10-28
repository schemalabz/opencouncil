import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteNotificationPreference } from '@/lib/db/notifications';

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

    await deleteNotificationPreference(params.id, currentUser.id);

    console.log(`User ${currentUser.email} deleted notification preference ${params.id}`);

    return NextResponse.json({ success: true });
}

