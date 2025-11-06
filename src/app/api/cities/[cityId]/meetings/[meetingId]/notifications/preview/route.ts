import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getNotificationImpactPreviewData } from '@/lib/db/notifications';
import { calculateNotificationImpact } from '@/lib/notifications/matching';

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    const user = await getCurrentUser();
    if (!user) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const { subjectImportances } = await request.json();

    const { cityId, meetingId } = params;

    // Get meeting data and users with preferences from database
    const { subjects, usersWithPreferences } = await getNotificationImpactPreviewData(meetingId, cityId);

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
        subjects,
        usersWithPreferences,
        subjectImportanceOverrides
    );

    return NextResponse.json(result);
}

