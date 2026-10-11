// Server-only: these writes take no identity and check no session. The caller
// authorizes first — the meetings API routes and the MCP admin tools do.
import "server-only";
import { CouncilMeeting, Prisma } from '@prisma/client';
import { getCityNameEn } from '@/lib/db/citiesAdmin';
import {
    createCouncilMeetingDirect,
    editCouncilMeetingDirect,
    generateUniqueMeetingId,
    type CouncilMeetingWithAdminBody,
} from '@/lib/db/meetings';
import { sendMeetingCreatedAdminAlert } from '@/lib/discord';
import { syncMeetingToCalendar } from '@/lib/google-calendar';
import { requestProcessAgendaInternal } from '@/lib/tasks/processAgendaInternal';
import { revalidateAfterResponse } from '@/lib/cache/afterResponse';

export type NewMeetingInput = {
    name: string;
    name_en: string;
    date: Date;
    youtubeUrl?: string | null;
    agendaUrl?: string | null;
    /** Omit to generate a unique id from the date. */
    meetingId?: string;
    administrativeBodyId?: string | null;
    /** Queue the processAgenda task when there is an agenda URL. */
    processAgenda?: boolean;
};

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
    const { name, name_en, date, youtubeUrl, agendaUrl, administrativeBodyId, processAgenda } = input;

    let meetingId = input.meetingId || (await generateUniqueMeetingId(cityId, date));

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

    let meeting: CouncilMeetingWithAdminBody;
    try {
        meeting = await createCouncilMeetingDirect(buildMeetingData(meetingId));
    } catch (error) {
        // Retry with a fresh ID on unique constraint violation (TOCTOU race).
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        if (input.meetingId) throw error;
        meetingId = await generateUniqueMeetingId(cityId, date);
        meeting = await createCouncilMeetingDirect(buildMeetingData(meetingId));
    }

    revalidateAfterResponse({
        // The city row carries the meeting count the overview reads to decide
        // whether it has data at all.
        tags: [`city:${cityId}:meetings`, `city:${cityId}:basic`],
        paths: [{ path: `/${cityId}`, type: 'layout' }],
    });

    // Fetch city data (should exist since meeting was created successfully)
    const cityNameEn = await getCityNameEn(cityId);

    if (cityNameEn === null) {
        console.error(`City ${cityId} not found after meeting creation - this should not happen`);
        // Continue without city data - meeting was already created
    } else {
        sendMeetingCreatedAdminAlert({
            cityName: cityNameEn,
            meetingName: name_en,
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

export type MeetingDetailsEdit = Partial<Pick<
    CouncilMeeting,
    'name' | 'name_en' | 'dateTime' | 'youtubeUrl' | 'agendaUrl' | 'administrativeBodyId'
>>;

/**
 * Edit the details of a meeting, then invalidate the caches and update the
 * calendar event. An absent field stays as it is.
 */
export async function updateMeetingWithEffects(
    cityId: string,
    meetingId: string,
    data: MeetingDetailsEdit
): Promise<CouncilMeetingWithAdminBody> {
    const meeting = await editCouncilMeetingDirect(cityId, meetingId, data);

    revalidateAfterResponse({
        tags: [`city:${cityId}:meetings`],
        paths: [{ path: `/${cityId}`, type: 'layout' }],
    });

    // Propagate date, administrative body, and agenda changes to the
    // Google Calendar event. The meeting name is not on the event.
    await syncMeetingToCalendar(cityId, meetingId);

    return meeting;
}
