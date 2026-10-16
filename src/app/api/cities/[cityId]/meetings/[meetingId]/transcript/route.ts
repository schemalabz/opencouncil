import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { generateMeetingDocxBuffer } from '@/lib/export/meetings-server';
import { generateMeetingFileName } from '@/lib/export/download';
import { handleApiError } from '@/lib/api/errors';

/**
 * The transcript as a .docx file: the same document the municipality receives
 * by email (sendTranscript in src/lib/documents/transcript.ts), built on the server in the city's
 * language. 404 for a meeting that has no transcript yet.
 */
export async function GET(
    _request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const { cityId, meetingId } = await props.params;
    await withUserAuthorizedToEdit({ councilMeetingId: meetingId, cityId });

    let buffer: Buffer;
    try {
        buffer = await generateMeetingDocxBuffer(cityId, meetingId);
    } catch (error) {
        return handleApiError(error, 'Failed to build the transcript');
    }

    return new NextResponse(new Uint8Array(buffer), {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${generateMeetingFileName(cityId, meetingId, 'docx')}"`,
        },
    });
}
