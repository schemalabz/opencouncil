import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import { getDecisionsTableData } from '@/lib/decisionsTable/getDecisionsTableData';
import { renderDecisionsTableDocx } from '@/components/meetings/docx/DecisionsTableDocx';

/**
 * The Πίνακας αποφάσεων as a .docx, for the back office to post on the
 * municipality's website. Admins only: readers see the table in the meeting
 * page's panel and cannot download it.
 */
export async function GET(
    _request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const { cityId, meetingId } = await props.params;
    await withUserAuthorizedToEdit({ cityId });

    let blob: Blob;
    try {
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
