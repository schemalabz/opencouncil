import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getMeetingDataCore } from '@/lib/getMeetingData';
import { editCouncilMeeting } from '@/lib/db/meetings';
import { z } from 'zod';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { updateMeetingCalendarEvent, createMeetingCalendarEvent, buildMeetingCalendarParams } from '@/lib/google-calendar';
import prisma from '@/lib/db/prisma';

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
    try {
        const data = await getMeetingDataCore(params.cityId, params.meetingId);
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

        
        // Sync updated date/time to Google Calendar
        try {
            const city = await prisma.city.findUnique({
                where: { id: params.cityId },
                select: { name: true, timezone: true }
            });

            if (city) {
                const calendarParams = buildMeetingCalendarParams({
                    cityName: city.name,
                    administrativeBodyName: meeting.administrativeBody?.name,
                    agendaUrl: meeting.agendaUrl,
                    meetingUrl: `${process.env.NEXTAUTH_URL}/${params.cityId}/${params.meetingId}`,
                    startTime: date,
                    timezone: city.timezone,
                });

                if (meeting.calendarEventId) {
                    // Update the existing calendar event
                    await updateMeetingCalendarEvent(meeting.calendarEventId, calendarParams);
                } else {
                    // No calendar event exists yet — create one and store the ID
                    const calendarEvent = await createMeetingCalendarEvent(calendarParams);
                    if (calendarEvent) {
                        await prisma.councilMeeting.update({
                            where: { cityId_id: { cityId: params.cityId, id: params.meetingId } },
                            data: { calendarEventId: calendarEvent.id },
                        });
                    }
                }

                console.log('Meeting calendar event synced successfully');
            }
        } catch (error) {
            // Don't fail the meeting update if calendar sync fails
            console.error('Failed to sync meeting to Google Calendar:', error);
        }

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