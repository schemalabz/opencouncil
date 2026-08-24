import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { getCouncilMeetingsForCity, generateUniqueMeetingId } from '@/lib/db/meetings';
import { createCouncilMeetingDirect } from '@/lib/db/meetingsCreate';
import { withServiceOrUserAuth } from '@/lib/auth';
import { sendMeetingCreatedAdminAlert } from '@/lib/discord';
import { syncMeetingToCalendar } from '@/lib/google-calendar';
import { requestProcessAgendaInternal } from '@/lib/tasks/processAgendaInternal';
import { handleApiError } from '@/lib/api/errors';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { meetingSchema } from '@/lib/zod-schemas/meeting';

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

export async function POST(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const authResult = await withServiceOrUserAuth(request, { cityId: params.cityId });
        const body = await request.json();
        const { name, name_en, date, youtubeUrl, agendaUrl, meetingId: providedMeetingId, administrativeBodyId, processAgenda } = meetingSchema.parse(body);
        const cityId = params.cityId;

        // Auto-generate meetingId if not provided
        let meetingId = providedMeetingId || (await generateUniqueMeetingId(cityId, date));

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

        // Auth was already verified by withServiceOrUserAuth above,
        // so use createCouncilMeetingDirect which skips the internal session check.
        let meeting;
        try {
            meeting = await createCouncilMeetingDirect(buildMeetingData(meetingId));
        } catch (error) {
            // Retry with a fresh ID on unique constraint violation (TOCTOU race).
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
            if (providedMeetingId) throw error;
            meetingId = await generateUniqueMeetingId(cityId, date);
            meeting = await createCouncilMeetingDirect(buildMeetingData(meetingId));
        }

        revalidateTag(`city:${cityId}:meetings`, 'max');
        revalidatePath(`/${cityId}`, "layout");

        // Fetch city data (should exist since meeting was created successfully)
        const city = await prisma.city.findUnique({
            where: { id: cityId },
            select: { name_en: true }
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
        }

        // Runs outside the city check above, because the sync loads the city itself.
        await syncMeetingToCalendar(cityId, meetingId, { allowCreate: true });

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

export async function GET(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
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
