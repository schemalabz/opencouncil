import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db/prisma';

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Verify this preference belongs to the current user
        const preference = await prisma.notificationPreference.findUnique({
            where: { id: params.id }
        });

        if (!preference || preference.userId !== currentUser.id) {
            return NextResponse.json(
                { error: 'Notification preference not found' },
                { status: 404 }
            );
        }

        // Delete the preference
        await prisma.notificationPreference.delete({
            where: { id: params.id }
        });

        console.log(`User ${currentUser.email} deleted notification preference ${params.id}`);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error deleting notification preference:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

