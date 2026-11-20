import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import { previewNotificationImpact } from '@/lib/db/notifications';
import { notificationImpactPreviewRequestSchema } from '@/lib/zod-schemas/notification';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        // A superadmin only, as on the send. The guard comes before the
        // parse, so a caller without rights learns nothing of the schema.
        await withUserAuthorizedToEdit({});

        const { subjectImportances } = notificationImpactPreviewRequestSchema.parse(await request.json());

        const { cityId, meetingId } = params;

        return NextResponse.json(await previewNotificationImpact(cityId, meetingId, subjectImportances));
    } catch (error) {
        return handleApiError(error, 'Failed to preview the notifications');
    }
}
