import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getMeetingDataCore } from '@/lib/getMeetingData';
import { updateMeetingRecord } from '@/lib/db/meetingLifecycle';
import { getCouncilMeetingDirect } from '@/lib/db/meetings';
import { LifecycleRuleError } from '@/lib/meetingLifecycleRules';
import { toPublicApiMeeting } from '@/lib/meetingPublic';
import { z } from 'zod';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { syncMeetingToCalendar } from '@/lib/google-calendar';

export async function GET(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        const data = await getMeetingDataCore(params.cityId, params.meetingId);
        // No auth on this endpoint: the meeting carries its display names and
        // never the id of the meeting that it replaced.
        const meeting = toPublicApiMeeting(data.meeting, {
            timezone: data.city.timezone,
            postponedFromDate: data.meeting.postponedFromDate,
        });
        // Strip transcript data when hidden for review
        if (data.transcriptHiddenForReview) {
            return NextResponse.json({ ...data, meeting, transcript: [], speakerTags: [] });
        }
        return NextResponse.json({ ...data, meeting });
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

/** An empty value clears the field; an omitted one leaves it as it is. */
function emptyToNull(value: string | null | undefined): string | null | undefined {
    return value === undefined ? undefined : value || null;
}

export async function PUT(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        const body = await request.json();
        const {
            name, name_en, date, youtubeUrl, agendaUrl, administrativeBodyId,
            kind, scheduleStatus, scheduleStatusReason, sessionNumber, format, closedToPublic, place, postponedFromId, continuationOfId,
        } = meetingSchema.parse(body);

        const before = await getCouncilMeetingDirect(params.cityId, params.meetingId);

        // A field that the request leaves out keeps its value.
        const meeting = await updateMeetingRecord(params.cityId, params.meetingId, {
            name,
            name_en,
            dateTime: date,
            youtubeUrl: emptyToNull(youtubeUrl),
            agendaUrl: emptyToNull(agendaUrl),
            administrativeBodyId: emptyToNull(administrativeBodyId),
            kind,
            scheduleStatus,
            scheduleStatusReason,
            sessionNumber,
            format,
            closedToPublic,
            place,
            postponedFromId,
            continuationOfId,
        });

        revalidateTag(`city:${params.cityId}:meetings`, 'max');
        revalidatePath(`/${params.cityId}`, "layout");

        // Propagate date, administrative body, agenda and schedule status
        // changes to the Google Calendar event. The meeting name is not on the
        // event.
        // A meeting that was created postponed or cancelled has no event yet;
        // when it becomes scheduled, it gets one (a future meeting only).
        const rescheduled = before?.scheduleStatus !== 'scheduled' && meeting.scheduleStatus === 'scheduled';
        await syncMeetingToCalendar(params.cityId, params.meetingId, { allowCreate: rescheduled });

        return NextResponse.json(meeting);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Validation error:', error.errors);
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        if (error instanceof LifecycleRuleError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
        }
        console.error('Failed to update meeting:', error);
        return NextResponse.json(
            { error: 'Failed to update meeting' },
            { status: 500 }
        );
    }
}