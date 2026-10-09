// Server-only: these writes take no identity and check no session. The caller
// authorizes first — the meetings API routes and the MCP admin tools do.
// Every write goes through the lifecycle module, so it runs the rules of the
// record.
import "server-only";
import { Prisma } from '@prisma/client';
import { ConflictError } from '@/lib/api/errors';
import { getCityNameEnAndTimezone } from '@/lib/db/citiesAdmin';
import { cityListTags, generateUniqueMeetingId, getCouncilMeetingDirect, upcomingMeetingsTag, type CouncilMeetingWithAdminBody } from '@/lib/db/meetings';
import { getCityRealm } from '@/lib/db/cityRealm';
import { landingSubjectsTag } from '@/lib/db/subject';
import { createMeetingRecord, updateMeetingRecord, type MeetingRecordFields } from '@/lib/db/meetingLifecycle';
import { sendMeetingCreatedAdminAlert } from '@/lib/discord';
import { syncMeetingToCalendar } from '@/lib/google-calendar';
import { requestProcessAgendaInternal } from '@/lib/tasks/processAgendaInternal';
import { revalidateAfterResponse } from '@/lib/cache/afterResponse';
import { meetingLabel } from '@/lib/meetingName';
import { pickRecordInput, takesPlace, type MeetingRecordInput } from '@/lib/meetingLifecycleRules';
import { after } from 'next/server';
import { processAgendaText } from '@/lib/agendaText';
import { isSecondaryBody } from '@/lib/utils/bodyTier';
import { meetingHasSucceededTask } from '@/lib/db/tasksInternal';
import { ConflictError } from '@/lib/api/errors';

/** The name of a meeting is derived (see meetingName.ts), so the input has no name. */
export type NewMeetingInput = {
    date: Date;
    youtubeUrl?: string | null;
    agendaUrl?: string | null;
    /** Omit to generate a unique id from the date. */
    meetingId?: string;
    administrativeBodyId?: string | null;
    /** Queue the processAgenda task when there is an agenda URL. */
    processAgenda?: boolean;
    /** The agenda as pasted text, when there is no agenda URL (lib/agendaText.ts). */
    agendaText?: string | null;
} & MeetingRecordInput & Partial<Pick<MeetingRecordFields, 'postponedFromId' | 'continuationOfId'>>;

export type ProcessAgendaOutcome = string | 'failed' | 'skipped_no_agenda' | 'from_text';

/**
 * The work of a write that runs after the response: the extraction of a
 * pasted agenda, then the start of the transcription, when the write brings
 * both. The order matters: the summary that follows the transcription writes
 * the statements of the subjects, and an agenda saved after it would replace
 * them. The model takes a while, and the admin waits for none of it. A failed
 * extraction is logged; the admin sees a meeting without subjects and pastes
 * the text again.
 */
function runAfterResponse(cityId: string, meetingId: string, agendaText: string | null | undefined, startTranscription: (() => Promise<void>) | null): void {
    if (!agendaText && !startTranscription) return;
    after(async () => {
        if (agendaText) {
            await processAgendaText(cityId, meetingId, agendaText).catch((error: unknown) => {
                console.error(`Failed to extract the pasted agenda of ${cityId}/${meetingId}:`, error);
            });
        }
        if (startTranscription) await startTranscription();
    });
}

/**
 * Create an unreleased meeting and run everything a new meeting needs: cache
 * invalidation, the Discord admin alert, the calendar event, and optionally
 * the processAgenda task.
 */
export async function createMeetingWithEffects(
    cityId: string,
    input: NewMeetingInput
): Promise<{ meeting: CouncilMeetingWithAdminBody; processAgendaStatus?: ProcessAgendaOutcome }> {
    const { date, youtubeUrl, agendaUrl, administrativeBodyId, processAgenda, postponedFromId, continuationOfId, agendaText } = input;
    const record = pickRecordInput(input);

    let meetingId = input.meetingId || (await generateUniqueMeetingId(cityId, date));

    const buildMeetingData = (id: string) => ({
        ...record,
        id,
        dateTime: date,
        cityId,
        youtubeUrl: youtubeUrl || null,
        agendaUrl: agendaUrl || null,
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

    // A secondary body runs its own meetings (#829): no alert to the operators'
    // channel and no event on the municipal calendar.
    const secondary = isSecondaryBody(meeting.administrativeBody);

    // Fetch city data (should exist since meeting was created successfully)
    const city = await getCityNameEnAndTimezone(cityId);

    if (city === null) {
        console.error(`City ${cityId} not found after meeting creation - this should not happen`);
        // Continue without city data - meeting was already created
    } else if (!secondary) {
        sendMeetingCreatedAdminAlert({
            cityName: city.name_en,
            meetingName: meetingLabel(meeting, 'en', city.timezone),
            meetingDate: date,
            meetingId: meetingId,
            cityId: cityId,
        });
    }

    // Runs outside the city check above, because the sync loads the city itself.
    if (!secondary) await syncMeetingToCalendar(cityId, meetingId, { allowCreate: true });

    // A pasted agenda takes the place of the PDF when there is no URL.
    const pastedAgenda = !agendaUrl && agendaText ? agendaText : null;
    runAfterResponse(cityId, meetingId, pastedAgenda, unattendedTranscriptionStart(meeting));
    if (pastedAgenda) return { meeting, processAgendaStatus: 'from_text' };

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

export type MeetingDetailsEdit = Partial<MeetingRecordFields> & {
    /** The agenda as pasted text: its items replace the subjects of the meeting (lib/agendaText.ts). */
    agendaText?: string | null;
};

/**
 * Edit the details of a meeting through the lifecycle rules, then invalidate
 * the caches and update the calendar event. An absent field stays as it is.
 */
export async function updateMeetingWithEffects(
    cityId: string,
    meetingId: string,
    { agendaText, ...data }: MeetingDetailsEdit
): Promise<CouncilMeetingWithAdminBody> {
    // A pasted agenda belongs before the meeting: after the summary, the
    // subjects hold the discussion, and processAgendaText refuses the text.
    // The refusal comes before the write, so the form learns it and the
    // agenda link stays as it is.
    if (agendaText && await meetingHasSucceededTask(cityId, meetingId, 'summarize')) {
        throw new ConflictError('The meeting has a summary; a pasted agenda does not replace it');
    }
    const before = await getCouncilMeetingDirect(cityId, meetingId);
    const meeting = await updateMeetingRecord(cityId, meetingId, data);
    if (agendaText) extractAgendaTextAfterResponse(cityId, meetingId, agendaText);

    // The landing lists the upcoming meetings that take place, so a change of
    // status, date or body can move a meeting in or out of that list. A public
    // meeting that changes tier (#829) can give a city its only public route,
    // or take it away, so the city lists follow too.
    const realm = await getCityRealm(cityId);
    const secondary = isSecondaryBody(meeting.administrativeBody);
    const tierChanged = !!before && isSecondaryBody(before.administrativeBody) !== secondary;
    revalidateAfterResponse({
        tags: [
            `city:${cityId}:meetings`,
            ...(realm ? [upcomingMeetingsTag(realm), landingSubjectsTag(realm)] : []),
            ...(realm && tierChanged && (meeting.released || before.released) ? cityListTags(realm) : []),
        ],
        paths: [{ path: `/${cityId}`, type: 'layout' }],
    });

    // Propagate date, administrative body, agenda and schedule status changes
    // to the Google Calendar event, whose title is the label.
    // A meeting that was created postponed or cancelled has no event yet;
    // when it becomes scheduled, it gets one (a future meeting only). A
    // secondary body's meeting gets no event (see createMeetingWithEffects);
    // a meeting that moves to a primary body gets one now, and a meeting that
    // moves the other way keeps the event it has, kept in step with its date.
    const rescheduled = !!before && !takesPlace(before) && takesPlace(meeting);
    const becamePrimary = tierChanged && !secondary;
    await syncMeetingToCalendar(cityId, meetingId, { allowCreate: !secondary && (rescheduled || becamePrimary) });

    return meeting;
}
