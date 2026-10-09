import { NextResponse } from 'next/server';
import { getMeetingDataCore } from '@/lib/getMeetingData';
import { toPublicApiMeeting } from '@/lib/meetingPublic';
import { pickRecordInput } from '@/lib/meetingLifecycleRules';
import { handleApiError } from '@/lib/api/errors';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { updateMeetingWithEffects } from '@/lib/meetingWrites';

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
        // The URL names the meeting, and an edit queues no agenda task. The
        // facts of the record come from MEETING_RECORD_INPUT_KEYS, as on create.
        const input = meetingSchema.parse(body);
        const { date, youtubeUrl, agendaUrl, administrativeBodyId, name, name_en, postponedFromId, continuationOfId } = input;

        // A field that the request leaves out keeps its value.
        const meeting = await updateMeetingWithEffects(params.cityId, params.meetingId, {
            ...pickRecordInput(input),
            name,
            name_en,
            postponedFromId,
            continuationOfId,
            dateTime: date,
            youtubeUrl: emptyToNull(youtubeUrl),
            agendaUrl: emptyToNull(agendaUrl),
            administrativeBodyId: emptyToNull(administrativeBodyId),
        });

        return NextResponse.json(meeting);
    } catch (error) {
        return handleApiError(error, 'Failed to update meeting');
    }
}
