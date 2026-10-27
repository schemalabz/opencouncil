import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import { getDecisionsTableData } from '@/lib/decisionsTable/getDecisionsTableData';
import { renderDecisionsTableDocx } from '@/components/meetings/docx/DecisionsTableDocx';

/**
 * The Πίνακας αποφάσεων as a .docx, for the back office to post on the
 * municipality's website. The meeting's editors only, the same scope as the
 * meeting layout that shows them the download: a city admin, or an admin of
 * the meeting's body. Readers see the table in the panel and cannot download it.
 */
export async function GET(
    _request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const { cityId, meetingId } = await props.params;

    let blob: Blob;
    try {
        // Inside the try: the refusal is an ApiError, which handleApiError answers with 401 or 403.
        await withUserAuthorizedToEdit({ cityId, councilMeetingId: meetingId });
        blob = await renderDecisionsTableDocx(await getDecisionsTableData(cityId, meetingId));
    } catch (error) {
        return handleApiError(error, 'Failed to build the decisions table');
    }

    const safeCityId = cityId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeMeetingId = meetingId.replace(/[^a-zA-Z0-9_-]/g, '');
    return new NextResponse(new Uint8Array(await blob.arrayBuffer()), {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="decisions-table-${safeCityId}-${safeMeetingId}.docx"`,
        },
    });
}
