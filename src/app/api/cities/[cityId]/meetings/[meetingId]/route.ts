import { NextResponse } from 'next/server';
import { getMeetingDataCore } from '@/lib/getMeetingData';
import { z } from 'zod';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { ApiError } from '@/lib/api/errors';
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { updateMeetingWithEffects } from '@/lib/meetingWrites';
import { getCouncilMeetingDirect } from '@/lib/db/meetings';

export async function GET(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
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
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId, councilMeetingId: params.meetingId });
        const body = await request.json();
        const { name, name_en, date, youtubeUrl, agendaUrl, administrativeBodyId } = meetingSchema.parse(body);

        // Moving the meeting to another body, or to no body, needs rights on
        // the destination too: a body admin may not hand their meeting over or
        // take a meeting of another body.
        const current = await getCouncilMeetingDirect(params.cityId, params.meetingId);
        if (!current) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }
        const nextBodyId = administrativeBodyId || null;
        if (nextBodyId !== current.administrativeBodyId) {
            await withUserAuthorizedToEdit(nextBodyId
                ? { cityId: params.cityId, administrativeBodyId: nextBodyId }
                : { cityId: params.cityId });
        }

        const meeting = await updateMeetingWithEffects(params.cityId, params.meetingId, {
            name,
            name_en,
            dateTime: date,
            youtubeUrl: youtubeUrl || null,
            agendaUrl: agendaUrl || null,
            administrativeBodyId: administrativeBodyId || null,
        });

        return NextResponse.json(meeting);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Validation error:', error.errors);
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        if (error instanceof ApiError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        console.error('Failed to update meeting:', error);
        return NextResponse.json(
            { error: 'Failed to update meeting' },
            { status: 500 }
        );
    }
}