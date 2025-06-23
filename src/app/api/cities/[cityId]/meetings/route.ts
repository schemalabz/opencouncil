import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { createCouncilMeeting, getCouncilMeetingsForCity } from '@/lib/db/meetings';
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

const getMeetingsQuerySchema = z.object({
    limit: z.string()
        .optional()
        .transform((val) => val ? parseInt(val, 10) : undefined)
        .refine((val) => val === undefined || (!isNaN(val) && val >= 1 && val <= 100), {
            message: "Limit must be a number between 1 and 100"
        })
});

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        const body = await request.json();
        const { name, name_en, date, youtubeUrl, agendaUrl, meetingId, administrativeBodyId } = meetingSchema.parse(body);
        const cityId = params.cityId;

        const meeting = await createCouncilMeeting({
            name,
            name_en,
            id: meetingId,
            dateTime: date,
            cityId,
            youtubeUrl: youtubeUrl || null,
            agendaUrl: agendaUrl || null,
            released: false, // Set as unpublished by default
            muxPlaybackId: null,
            administrativeBodyId: administrativeBodyId || null,
        });

        revalidateTag(`city:${cityId}:meetings`);
        revalidatePath(`/${cityId}`, "layout");

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

export async function GET(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const { searchParams } = request.nextUrl;
        const queryParams = Object.fromEntries(searchParams.entries());
        
        const { limit } = getMeetingsQuerySchema.parse(queryParams);

        const meetings = await getCouncilMeetingsForCity(params.cityId, { 
            includeUnreleased: false,
            limit 
        });

        return NextResponse.json(meetings);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.errors },
                { status: 400 }
            );
        }
        console.error('Error fetching meetings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch meetings' },
            { status: 500 }
        );
    }
}