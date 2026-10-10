import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { UnauthorizedError, handleApiError } from '@/lib/api/errors';
import { getNotificationImpactPreviewData } from '@/lib/db/notifications';
import { calculateNotificationImpact } from '@/lib/notifications/matching';
import { notificationImpactPreviewRequestSchema } from '@/lib/zod-schemas/notification';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        const user = await getCurrentUser();
        if (!user) throw new UnauthorizedError();

        const { subjectImportances } = notificationImpactPreviewRequestSchema.parse(await request.json());

        const { cityId, meetingId } = params;

        // Get meeting data and users with preferences from database
        const { subjects, usersWithPreferences } = await getNotificationImpactPreviewData(meetingId, cityId);

        // Calculate impact using shared matching logic
        const result = await calculateNotificationImpact(
            subjects,
            usersWithPreferences,
            subjectImportances
        );

        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, 'Failed to preview the notifications');
    }
}
