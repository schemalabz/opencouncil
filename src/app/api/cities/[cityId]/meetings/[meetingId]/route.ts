import { NextRequest, NextResponse } from 'next/server';
import { getTranscript } from '@/lib/db/transcript';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ cityId: string, meetingId: string }> }
) {
    const { cityId, meetingId } = await params;

    try {
        const transcript = await getTranscript(meetingId, cityId);
        const topicLabelCount = transcript.reduce((acc, segment) => {
            return acc + segment.topicLabels.length;
        }, 0);

        if (!transcript) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        return NextResponse.json(transcript);
    } catch (error) {
        console.error('Error fetching transcript:', error);
        return NextResponse.json({ error: 'Failed to fetch transcript' }, { status: 500 });
    }
}
