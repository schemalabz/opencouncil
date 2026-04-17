import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { renderMinutesDocx } from '@/components/meetings/docx/MinutesDocx';

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const data = await getMinutesData(params.cityId, params.meetingId);

    const { searchParams } = new URL(request.url);
    if (searchParams.get('format') === 'json') {
        return NextResponse.json(data);
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
}
