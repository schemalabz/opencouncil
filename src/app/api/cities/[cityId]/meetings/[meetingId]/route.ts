import { NextResponse } from 'next/server';
import { getMeetingData } from '@/lib/getMeetingData';
import { getCities } from '@/lib/db/cities';
import { getCouncilMeetingsForCity, editCouncilMeeting } from '@/lib/db/meetings';
import { z } from 'zod';

/*
// Revalidate every 1 minute
export const revalidate = 60;

export async function generateStaticParams() {
    const allCities = await getCities({ includeUnlisted: true });
    const allMeetings = await Promise.all(allCities.map((city) => getCouncilMeetingsForCity(city.id)));
    return allMeetings.flat().map((meeting) => ({ meetingId: meeting.id, cityId: meeting.cityId }));
}
*/

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