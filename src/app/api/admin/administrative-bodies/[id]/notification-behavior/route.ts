import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db/prisma';

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser?.isSuperAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { notificationBehavior } = body;

        if (!notificationBehavior || !['NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_AUTO', 'NOTIFICATIONS_APPROVAL'].includes(notificationBehavior)) {
            return NextResponse.json(
                { error: 'Valid notificationBehavior is required' },
                { status: 400 }
            );
        }

        const updatedBody = await prisma.administrativeBody.update({
            where: { id: params.id },
            data: {
                notificationBehavior
            },
            include: {
                city: true
            }
        });

        console.log(`Admin ${currentUser.email} updated notification behavior for ${updatedBody.name} to ${notificationBehavior}`);

        return NextResponse.json(updatedBody);

    } catch (error) {
        console.error('Error updating notification behavior:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

