import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { ConflictError, handleApiError } from '@/lib/api/errors';
import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { renderMinutesDocx } from '@/components/meetings/docx/MinutesDocx';
import { authorityHasDocument } from '@/lib/utils/authority';

export async function GET(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });

        const data = await getMinutesData(params.cityId, params.meetingId);

        const { searchParams } = new URL(request.url);
        if (searchParams.get('format') === 'json') {
            return NextResponse.json(data);
        }

        // The decisions page reads the JSON for its own tables. The document is
        // the part that a region does not get (authorityHasDocument).
        if (!authorityHasDocument(data.city, 'minutes')) {
            throw new ConflictError('The minutes are not available for a region');
        }

        // Default: return DOCX binary
        const blob = await renderMinutesDocx(data);
        const buffer = Buffer.from(await blob.arrayBuffer());

        const safeCityId = params.cityId.replace(/[^a-zA-Z0-9_-]/g, '');
        const safeMeetingId = params.meetingId.replace(/[^a-zA-Z0-9_-]/g, '');

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="minutes-${safeCityId}-${safeMeetingId}.docx"`,
            },
        });
    } catch (error) {
        return handleApiError(error, 'Failed to build the minutes');
    }
}
