import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { deleteNotification } from '@/lib/db/notifications';

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    await withUserAuthorizedToEdit({});
    const { id } = params;

    await deleteNotification(id);

    return NextResponse.json({
        success: true,
        message: 'Notification deleted successfully'
    });
}
