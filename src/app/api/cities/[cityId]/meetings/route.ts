import { NextRequest, NextResponse } from 'next/server';
import { getCouncilMeetingsForCity } from '@/lib/db/meetingsList';
import { originalScheduledDates } from '@/lib/db/meetingLifecycle';
import { withUserAuthorizedToEdit, getUnreleasedScope } from '@/lib/auth';
import { ALL_UNRELEASED, NO_UNRELEASED, type UnreleasedScope } from '@/lib/unreleased';
import { createMeetingWithEffects } from '@/lib/meetingWrites';
import { handleApiError } from '@/lib/api/errors';
import { getCityTimezone } from '@/lib/db/cityTimezone';
import { meetingListQuerySchema, meetingSchema } from '@/lib/zod-schemas/meeting';
import { hideLinks, toPublicApiMeeting } from '@/lib/meetingPublic';
import { resolveDateRange } from '@/lib/dates/dayBounds';

export async function POST(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const body = await request.json();
        // A body admin creates meetings of their body only, so the check
        // carries the body; a meeting with no body is the city's. The check
        // runs before the parse, so a caller without rights learns nothing
        // about the schema.
        const bodyId = typeof body?.administrativeBodyId === 'string' && body.administrativeBodyId ? body.administrativeBodyId : undefined;
        await withUserAuthorizedToEdit(bodyId
            ? { cityId: params.cityId, administrativeBodyId: bodyId }
            : { cityId: params.cityId });
        const { processAgenda, ...input } = meetingSchema.parse(body);

        // Auth was already verified by withUserAuthorizedToEdit above. The shared
        // write runs the lifecycle rules and does no auth of its own.
        const { meeting, processAgendaStatus } = await createMeetingWithEffects(params.cityId, { ...input, processAgenda });

        return NextResponse.json({
            ...meeting,
            ...(processAgenda && { processAgendaStatus }),
        }, { status: 201 });
    } catch (error) {
        return handleApiError(error, 'Failed to create meeting');
    }
}

export async function GET(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const { searchParams } = request.nextUrl;
        const queryParams = Object.fromEntries(searchParams.entries());

        const { limit, from, to, includeUnreleased } = meetingListQuerySchema.parse(queryParams);

        // includeUnreleased needs an editor of the city. A body admin is one:
        // they get the drafts of their bodies and no other, so the meeting form
        // can offer them the meeting that a new one replaces.
        let unreleased: UnreleasedScope = NO_UNRELEASED;
        if (includeUnreleased) {
            const scope = await getUnreleasedScope(params.cityId);
            if (scope.all || scope.bodyIds.length > 0) {
                unreleased = scope;
            } else {
                // No session with rights here: 401 without a session, 403 with one.
                await withUserAuthorizedToEdit({ cityId: params.cityId });
                unreleased = ALL_UNRELEASED;
            }
        }

        const timezone = await getCityTimezone(params.cityId);
        const meetings = await getCouncilMeetingsForCity(params.cityId, {
            unreleased,
            limit,
            ...resolveDateRange({ from, to }, timezone),
            // The editor list spans both tiers (#829): the picker of a postponed
            // meeting narrows it to the body of the new meeting itself, and the
            // secretary of a youth council must find the meeting they replace.
            ...(includeUnreleased && { tier: 'all' as const }),
        });

        // An editor gets the rows as they are, links included, for the admin
        // form. The public list never names the meeting that a new meeting
        // replaced: it gets the date instead.
        if (includeUnreleased) {
            return NextResponse.json(meetings);
        }
        const dates = await originalScheduledDates(params.cityId, meetings);
        return NextResponse.json(meetings.map(meeting =>
            toPublicApiMeeting(hideLinks(meeting), { timezone, postponedFromDate: dates.get(meeting.id) ?? null })));
    } catch (error) {
        return handleApiError(error, 'Failed to fetch meetings');
    }
}
