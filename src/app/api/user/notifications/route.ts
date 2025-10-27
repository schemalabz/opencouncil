import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const cityId = request.nextUrl.searchParams.get('cityId');

        if (!cityId) {
            return NextResponse.json(
                { error: 'cityId is required' },
                { status: 400 }
            );
        }

        // Get all notifications for this user in this city
        const notifications = await prisma.notification.findMany({
            where: {
                userId: currentUser.id,
                cityId
            },
            include: {
                meeting: {
                    select: {
                        id: true,
                        name: true,
                        dateTime: true
                    }
                },
                subjects: {
                    select: {
                        subject: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                deliveries: {
                    select: {
                        status: true,
                        medium: true,
                        sentAt: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 50 // Limit to last 50 notifications
        });

        return NextResponse.json({ notifications });

    } catch (error) {
        console.error('Error fetching user notifications:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

