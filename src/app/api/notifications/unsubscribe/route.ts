import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { verifyUnsubscribeToken } from '@/lib/notifications/tokens';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json(
                { error: 'Token is required' },
                { status: 400 }
            );
        }

        // Verify the token
        const tokenData = verifyUnsubscribeToken(token);

        if (!tokenData) {
            return NextResponse.json(
                { error: 'Invalid or expired token' },
                { status: 400 }
            );
        }

        // Delete the notification preference
        const deleted = await prisma.notificationPreference.deleteMany({
            where: {
                userId: tokenData.userId,
                cityId: tokenData.cityId
            }
        });

        if (deleted.count === 0) {
            return NextResponse.json(
                { error: 'Notification preference not found' },
                { status: 404 }
            );
        }

        console.log(`User ${tokenData.userId} unsubscribed from city ${tokenData.cityId}`);

        return NextResponse.json({
            success: true,
            message: 'Successfully unsubscribed from notifications'
        });

    } catch (error) {
        console.error('Error unsubscribing:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// GET endpoint for unsubscribe via email link (with token in query param)
export async function GET(request: NextRequest) {
    try {
        const token = request.nextUrl.searchParams.get('token');

        if (!token) {
            return new NextResponse('Token is required', { status: 400 });
        }

        // Verify the token
        const tokenData = verifyUnsubscribeToken(token);

        if (!tokenData) {
            return new NextResponse('Invalid or expired token', { status: 400 });
        }

        // Redirect to a confirmation page with the token
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://opencouncil.gr';
        return NextResponse.redirect(`${baseUrl}/el/unsubscribe?token=${token}`);

    } catch (error) {
        console.error('Error processing unsubscribe:', error);
        return new NextResponse('Internal server error', { status: 500 });
    }
}

