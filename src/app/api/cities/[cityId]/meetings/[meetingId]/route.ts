import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getMeetingDataCore } from '@/lib/getMeetingData';
import { editCouncilMeeting } from '@/lib/db/meetings';
import { z } from 'zod';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { meetingSchema } from '@/lib/zod-schemas/meeting';

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    try {
        const data = await getMeetingDataCore(params.cityId, params.meetingId);
        // Strip transcript data when hidden for review (no auth on this endpoint)
        if (data.transcriptHiddenForReview) {
            return NextResponse.json({ ...data, transcript: [], speakerTags: [] });
        }
        return NextResponse.json({ ...data });
    } catch (error) {
        // TODO: Brittle string match — refactor getMeetingData to return null instead of throwing
        if (error instanceof Error && error.message === 'Required data not found') {
            return NextResponse.json(
                { error: 'Meeting not found' },
                { status: 404 }
            );
        }
        console.error('Failed to fetch meeting:', error);
        return NextResponse.json(
            { error: 'Failed to fetch meeting' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        const body = await request.json();
        const { name, name_en, date, youtubeUrl, agendaUrl, meetingId, administrativeBodyId } = meetingSchema.parse(body);

        const meeting = await editCouncilMeeting(params.cityId, params.meetingId, {
            name,
            name_en,
            dateTime: date,
            youtubeUrl: youtubeUrl || null,
            agendaUrl: agendaUrl || null,
            administrativeBodyId: administrativeBodyId || null,
        });

        revalidateTag(`city:${params.cityId}:meetings`);
        revalidatePath(`/${params.cityId}`, "layout");

        return NextResponse.json(meeting);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Validation error:', error.errors);
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        console.error('Failed to update meeting:', error);
        return NextResponse.json(
            { error: 'Failed to update meeting' },
            { status: 500 }
        );
    }
}