import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import { calculateNotificationImpact } from '@/lib/notifications/matching';

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { subjectImportances } = await request.json();

        const { cityId, meetingId } = params;

        // Fetch meeting with subjects
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id: meetingId } },
            include: {
                subjects: {
                    include: {
                        topic: true,
                        location: true
                    }
                }
            }
        });

        if (!meeting) {
            return new NextResponse('Meeting not found', { status: 404 });
        }

        // Get all users with notification preferences for this city
        const usersWithPreferences = await prisma.notificationPreference.findMany({
            where: { cityId },
            include: {
                user: true,
                locations: true,
                interests: true
            }
        });

        // Transform subjectImportances to the format expected by matching function
        const subjectImportanceOverrides: Record<string, {
            topicImportance: 'doNotNotify' | 'normal' | 'high';
            proximityImportance: 'none' | 'near' | 'wide';
        }> = {};

        if (subjectImportances && typeof subjectImportances === 'object') {
            Object.entries(subjectImportances).forEach(([subjectId, importance]: [string, any]) => {
                subjectImportanceOverrides[subjectId] = {
                    topicImportance: importance.topicImportance || 'doNotNotify',
                    proximityImportance: importance.proximityImportance || 'none'
                };
            });
        }

        // Calculate impact using shared matching logic
        const result = await calculateNotificationImpact(
            meeting.subjects,
            usersWithPreferences,
            subjectImportanceOverrides
        );

        return NextResponse.json(result);

    } catch (error) {
        console.error('Error calculating notification impact:', error);
        return new NextResponse('Internal server error', { status: 500 });
    }
}

