import { NextRequest, NextResponse } from 'next/server';
import { getAdminRealms } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import { deleteNotification } from '@/lib/db/notifications';

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await getAdminRealms();
        const { id } = params;

        // deleteNotification checks the `admin` right on the city of the notification.
        await deleteNotification(id);

        return NextResponse.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        return handleApiError(error, 'Failed to delete notification');
    }
}
