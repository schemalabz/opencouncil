import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getMeetingData } from '@/lib/getMeetingData';
import { editCouncilMeeting } from '@/lib/db/meetings';
import { z } from 'zod';
import { withUserAuthorizedToEdit } from '@/lib/auth';

const meetingSchema = z.object({
    name: z.string().min(2, {
        message: "Meeting name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Meeting name (English) must be at least 2 characters.",
    }),
    date: z.string()
        .refine(val => !isNaN(new Date(val).getTime()), {
            message: "Invalid date/time format"
        })
        .transform((str) => new Date(str)),
    youtubeUrl: z.string().url({
        message: "Invalid YouTube URL.",
    }).optional().or(z.literal("")),
    agendaUrl: z.string().url({
        message: "Invalid Agenda URL.",
    }).optional().or(z.literal("")),
    meetingId: z.string().min(1, {
        message: "Meeting ID is required.",
    }),
    administrativeBodyId: z.string().optional(),
});

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    const data = await getMeetingData(params.cityId, params.meetingId);
    return NextResponse.json({ ...data });
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