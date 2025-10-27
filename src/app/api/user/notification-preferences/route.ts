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

        const preferences = await prisma.notificationPreference.findMany({
            where: {
                userId: currentUser.id
            },
            include: {
                city: {
                    select: {
                        id: true,
                        name: true,
                        name_municipality: true
                    }
                },
                locations: {
                    select: {
                        id: true,
                        text: true
                    }
                },
                interests: {
                    select: {
                        id: true,
                        name: true,
                        colorHex: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json({ preferences });

    } catch (error) {
        console.error('Error fetching notification preferences:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

