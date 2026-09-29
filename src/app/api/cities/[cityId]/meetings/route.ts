import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCouncilMeetingsForCity } from '@/lib/db/meetingsList';
import { withServiceOrUserAuth } from '@/lib/auth';
import { createMeetingWithEffects } from '@/lib/meetingWrites';
import { handleApiError } from '@/lib/api/errors';
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
        await withServiceOrUserAuth(request, { cityId: params.cityId });
        const body = await request.json();
        const { processAgenda, ...input } = meetingSchema.parse(body);

        // Auth was already verified by withServiceOrUserAuth above, so the
        // shared write skips the internal session check.
        const { meeting, processAgendaStatus } = await createMeetingWithEffects(params.cityId, { ...input, processAgenda });

        return NextResponse.json({
            ...meeting,
            ...(processAgenda && { processAgendaStatus }),
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
