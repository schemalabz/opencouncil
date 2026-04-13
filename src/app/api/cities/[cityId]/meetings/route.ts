import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { createCouncilMeeting, getCouncilMeetingsForCity } from '@/lib/db/meetings';
import { withServiceOrUserAuth } from '@/lib/auth';
import { sendMeetingCreatedAdminAlert } from '@/lib/discord';
import { createMeetingCalendarEvent, calculateMeetingEndTime } from '@/lib/google-calendar';
import { requestProcessAgendaInternal } from '@/lib/tasks/processAgendaInternal';
import { generateUniqueMeetingId } from '@/lib/utils/meetingId';
import { handleApiError } from '@/lib/api/errors';
import { env } from '@/env.mjs';
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
    meetingId: z.string().min(1).optional(),
    administrativeBodyId: z.string().optional(),
    processAgenda: z.boolean().optional().default(false),
});

const getMeetingsQuerySchema = z.object({
    limit: z.string()
        .optional()
        .transform((val) => val ? parseInt(val, 10) : undefined)
        .refine((val) => val === undefined || (!isNaN(val) && val >= 1 && val <= 100), {
            message: "Limit must be a number between 1 and 100"
        }),
    from: z.string()
        .optional()
        .refine((val) => !val || !isNaN(new Date(val).getTime()), { message: "Invalid 'from' date" })
        .transform((val) => val ? new Date(val) : undefined),
    to: z.string()
        .optional()
        .refine((val) => !val || !isNaN(new Date(val).getTime()), { message: "Invalid 'to' date" })
        .transform((val) => val ? new Date(val) : undefined),
    includeUnreleased: z.string()
        .optional()
        .transform((val) => val === 'true'),
});

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const authResult = await withServiceOrUserAuth(request, { cityId: params.cityId });
        const body = await request.json();
        const { name, name_en, date, youtubeUrl, agendaUrl, meetingId: providedMeetingId, administrativeBodyId, processAgenda } = meetingSchema.parse(body);
        const cityId = params.cityId;

        // Auto-generate meetingId if not provided
        let meetingId = providedMeetingId || await generateUniqueMeetingId(cityId, date);

        const buildMeetingData = (id: string) => ({
            name,
            name_en,
            id,
            dateTime: date,
            cityId,
            youtubeUrl: youtubeUrl || null,
            agendaUrl: agendaUrl || null,
            released: false as const,
            muxPlaybackId: null,
            administrativeBodyId: administrativeBodyId || null,
        });

        // Service auth: route already verified the API key, so create directly.
        // User auth: delegate to createCouncilMeeting which re-checks session auth.
        const createMeeting = async (id: string) =>
            authResult.type === 'service'
                ? prisma.councilMeeting.create({
                    data: buildMeetingData(id),
                    include: { administrativeBody: true },
                })
                : createCouncilMeeting(buildMeetingData(id));

        // Retry with a fresh ID on unique constraint violation (TOCTOU race)
        let meeting;
        try {
            meeting = await createMeeting(meetingId);
        } catch (error) {
            const isUniqueViolation = error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2002';
            if (!isUniqueViolation || providedMeetingId) throw error;
            meetingId = await generateUniqueMeetingId(cityId, date);
            meeting = await createMeeting(meetingId);
        }

        revalidateTag(`city:${cityId}:meetings`);
        revalidatePath(`/${cityId}`, "layout");

        // Fetch city data (should exist since meeting was created successfully)
        const city = await prisma.city.findUnique({
            where: { id: cityId },
            select: { name_en: true, name: true, timezone: true }
        });

        if (!city) {
            console.error(`City ${cityId} not found after meeting creation - this should not happen`);
            // Continue without city data - meeting was already created
        } else {
            // Send Discord admin alert
            sendMeetingCreatedAdminAlert({
                cityName: city.name_en,
                meetingName: name_en,
                meetingDate: date,
                meetingId: meetingId,
                cityId: cityId,
            });

            // Sync to Google Calendar
            try {
                // Build title in format: "city.name: administrative body.name" (using local names)
                let calendarTitle = city.name;

                if (meeting.administrativeBody?.name) {
                    calendarTitle += `: ${meeting.administrativeBody.name}`;
                }

                // Build description with agenda URL and meeting link
                const meetingUrl = `${env.NEXTAUTH_URL}/${cityId}/${meetingId}`;
                const descriptionParts: string[] = [];

                if (meeting.agendaUrl) {
                    descriptionParts.push(`Ημερήσια Διάταξη: ${meeting.agendaUrl}`);
                }

                descriptionParts.push(`${meetingUrl}`);

                const endTime = calculateMeetingEndTime(date, 2); // Default 2 hour meetings

                await createMeetingCalendarEvent({
                    title: calendarTitle,
                    description: descriptionParts.join('\n\n'),
                    startTime: date,
                    endTime: endTime,
                    timezone: city.timezone
                });

                console.log('Meeting synced to Google Calendar successfully');
            } catch (error) {
                // Don't fail the meeting creation if calendar sync fails
                console.error('Failed to sync meeting to Google Calendar:', error);
            }
        }

        // Auto-trigger processAgenda if requested and agenda URL is present
        let processAgendaStatus: string | undefined;
        if (processAgenda && agendaUrl) {
            try {
                const task = await requestProcessAgendaInternal(agendaUrl, meetingId, cityId);
                processAgendaStatus = task.status;
                console.log(`processAgenda triggered for meeting ${meetingId}: ${task.status}`);
            } catch (error) {
                console.error('Failed to trigger processAgenda:', error);
                processAgendaStatus = 'failed';
            }
        }

        return NextResponse.json({
            ...meeting,
            ...(processAgenda && { processAgendaStatus: processAgendaStatus || 'skipped_no_agenda' }),
        }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'Failed to create meeting');
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const { searchParams } = request.nextUrl;
        const queryParams = Object.fromEntries(searchParams.entries());

        const { limit, from, to, includeUnreleased } = getMeetingsQuerySchema.parse(queryParams);

        // includeUnreleased requires auth (service key or authorized user)
        if (includeUnreleased) {
            await withServiceOrUserAuth(request, { cityId: params.cityId });
        }

        const meetings = await getCouncilMeetingsForCity(params.cityId, {
            includeUnreleased,
            limit,
            from,
            to,
        });

        return NextResponse.json(meetings);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'Failed to fetch meetings');
    }
}
