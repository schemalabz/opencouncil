import { NextRequest, NextResponse } from 'next/server';
import { getTranscript } from '@/lib/db/transcript';

export async function GET(
    request: NextRequest,
    { params }: { params: { cityId: string, meetingId: string } }
) {
    const { cityId, meetingId } = params;

    try {
        const transcript = await getTranscript(meetingId, cityId);

        if (!transcript) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        return NextResponse.json(transcript);
    } catch (error) {
        console.error('Error fetching transcript:', error);
        return NextResponse.json({ error: 'Failed to fetch transcript' }, { status: 500 });
    }
}
