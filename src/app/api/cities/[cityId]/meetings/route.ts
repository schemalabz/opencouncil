import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCouncilMeeting } from '@/lib/db/meetings';

const meetingSchema = z.object({
    name: z.string().min(2),
    name_en: z.string().min(2),
    date: z.string().datetime(),
    youtubeUrl: z.string().min(1).url(),
    meetingId: z.string().min(1),
});

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const body = await request.json();
        const { name, name_en, date, youtubeUrl, meetingId } = meetingSchema.parse(body);
        const cityId = params.cityId;

        const meeting = await createCouncilMeeting({
            name,
            name_en,
            id: meetingId,
            dateTime: new Date(date),
            cityId,
            youtubeUrl,
            released: false, // Set as unpublished by default
        });

        return NextResponse.json(meeting, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.log(error.errors);
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        console.error('Failed to create meeting:', error);
        return NextResponse.json(
            { error: 'Failed to create meeting' },
            { status: 500 }
        );
    }
}