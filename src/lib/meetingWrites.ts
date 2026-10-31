// Server-only: these writes take no identity and check no session. The caller
// authorizes first — the meetings API routes and the MCP admin tools do.
// Every write goes through the lifecycle module, so it runs the rules of the
// record.
import "server-only";
import { Prisma } from '@prisma/client';
import { ConflictError } from '@/lib/api/errors';
import { getCityNameEnAndTimezone } from '@/lib/db/citiesAdmin';
import { generateUniqueMeetingId, getCouncilMeetingDirect, upcomingMeetingsTag, type CouncilMeetingWithAdminBody } from '@/lib/db/meetings';
import { getCityRealm } from '@/lib/db/cityRealm';
import { landingSubjectsTag } from '@/lib/db/subject';
import { createMeetingRecord, updateMeetingRecord, type MeetingRecordFields } from '@/lib/db/meetingLifecycle';
import { sendMeetingCreatedAdminAlert } from '@/lib/discord';
import { syncMeetingToCalendar } from '@/lib/google-calendar';
import { requestProcessAgendaInternal } from '@/lib/tasks/processAgendaInternal';
import { revalidateAfterResponse } from '@/lib/cache/afterResponse';
import { meetingLabel } from '@/lib/meetingName';
import { pickRecordInput, takesPlace, type MeetingRecordInput } from '@/lib/meetingLifecycleRules';

/** The name of a meeting is derived (see meetingName.ts), so the input has no name. */
export type NewMeetingInput = {
    date: Date;
    youtubeUrl?: string | null;
    agendaUrl?: string | null;
    /** The municipality's own verbatim minutes: the meeting is corrected from them in place of the review (#876). */
    municipalMinutesUrl?: string | null;
    /** Omit to generate a unique id from the date. */
    meetingId?: string;
    administrativeBodyId?: string | null;
    /** Queue the processAgenda task when there is an agenda URL. */
    processAgenda?: boolean;
} & MeetingRecordInput & Partial<Pick<MeetingRecordFields, 'postponedFromId' | 'continuationOfId'>>;

export type ProcessAgendaOutcome = string | 'failed' | 'skipped_no_agenda';

/**
 * Create an unreleased meeting and run everything a new meeting needs: cache
 * invalidation, the Discord admin alert, the calendar event, and optionally
 * the processAgenda task.
 */
export async function createMeetingWithEffects(
    cityId: string,
    input: NewMeetingInput
): Promise<{ meeting: CouncilMeetingWithAdminBody; processAgendaStatus?: ProcessAgendaOutcome }> {
    const { date, youtubeUrl, agendaUrl, municipalMinutesUrl, administrativeBodyId, processAgenda, postponedFromId, continuationOfId } = input;
    const record = pickRecordInput(input);

    let meetingId = input.meetingId || (await generateUniqueMeetingId(cityId, date));

    const buildMeetingData = (id: string) => ({
        ...record,
        id,
        dateTime: date,
        cityId,
        youtubeUrl: youtubeUrl || null,
        agendaUrl: agendaUrl || null,
        municipalMinutesUrl: municipalMinutesUrl || null,
        released: false as const,
        muxPlaybackId: null,
        administrativeBodyId: administrativeBodyId || null,
        // A null kind states no single kind (see MEETING_KINDS). A later part of a
        // meeting has no kind of its own: its first part holds it.
        kind: record.kind ?? null,
        postponedFromId,
        continuationOfId,
    });

    let meeting: CouncilMeetingWithAdminBody;
    try {
        meeting = await createMeetingRecord(buildMeetingData(meetingId));
    } catch (error) {
        // Retry with a fresh ID on unique constraint violation (TOCTOU race).
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        if (input.meetingId) throw new ConflictError(`A meeting with the id "${input.meetingId}" already exists.`);
        meetingId = await generateUniqueMeetingId(cityId, date);
        meeting = await createMeetingRecord(buildMeetingData(meetingId));
    }

    revalidateAfterResponse({
        // The city row carries the meeting count the overview reads to decide
        // whether it has data at all.
        tags: [`city:${cityId}:meetings`, `city:${cityId}:basic`],
        paths: [{ path: `/${cityId}`, type: 'layout' }],
    });

    // Fetch city data (should exist since meeting was created successfully)
    const city = await getCityNameEnAndTimezone(cityId);

    if (city === null) {
        console.error(`City ${cityId} not found after meeting creation - this should not happen`);
        // Continue without city data - meeting was already created
    } else {
        sendMeetingCreatedAdminAlert({
            cityName: city.name_en,
            meetingName: meetingLabel(meeting, 'en', city.timezone),
            meetingDate: date,
            meetingId: meetingId,
            cityId: cityId,
        });
    }

    // Runs outside the city check above, because the sync loads the city itself.
    await syncMeetingToCalendar(cityId, meetingId, { allowCreate: true });

    if (!processAgenda) return { meeting };
    if (!agendaUrl) return { meeting, processAgendaStatus: 'skipped_no_agenda' };

    try {
        const task = await requestProcessAgendaInternal(agendaUrl, meetingId, cityId);
        console.log(`processAgenda triggered for meeting ${meetingId}: ${task.status}`);
        return { meeting, processAgendaStatus: task.status };
    } catch (error) {
        console.error('Failed to trigger processAgenda:', error);
        return { meeting, processAgendaStatus: 'failed' };
    }
}

export type MeetingDetailsEdit = Partial<MeetingRecordFields>;

/**
 * Edit the details of a meeting through the lifecycle rules, then invalidate
 * the caches and update the calendar event. An absent field stays as it is.
 */
export async function updateMeetingWithEffects(
    cityId: string,
    meetingId: string,
    data: MeetingDetailsEdit
): Promise<CouncilMeetingWithAdminBody> {
    const before = await getCouncilMeetingDirect(cityId, meetingId);
    const meeting = await updateMeetingRecord(cityId, meetingId, data);

    // The landing lists the upcoming meetings that take place, so a change of
    // status, date or body can move a meeting in or out of that list.
    const realm = await getCityRealm(cityId);
    revalidateAfterResponse({
        tags: [
            `city:${cityId}:meetings`,
            ...(realm ? [upcomingMeetingsTag(realm), landingSubjectsTag(realm)] : []),
        ],
        paths: [{ path: `/${cityId}`, type: 'layout' }],
    });

    // Propagate date, administrative body, agenda and schedule status changes
    // to the Google Calendar event, whose title is the label.
    // A meeting that was created postponed or cancelled has no event yet;
    // when it becomes scheduled, it gets one (a future meeting only).
    const rescheduled = !!before && !takesPlace(before) && takesPlace(meeting);
    await syncMeetingToCalendar(cityId, meetingId, { allowCreate: rescheduled });

    return meeting;
}
