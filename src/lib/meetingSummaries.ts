import type { AdministrativeBodyType } from '@prisma/client';
import { getCouncilMeetingsForCityPublicCached, getMeetingSummaryCached } from '@/lib/cache';
import type { MeetingSummary } from '@/lib/db/types';

export interface MeetingSummariesArgs {
    /** One specific meeting; body filters do not apply. */
    meetingId?: string | null;
    /** Without `meetingId`: how many of the latest released past meetings to show. */
    limit: number;
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
}

/**
 * The meetings the summary widget shows, newest first: the requested meeting,
 * or the latest released past meetings of the city. An unknown or unreleased
 * `meetingId` yields an empty list, so the iframe renders its empty state
 * rather than a 404.
 */
export async function getMeetingSummaries(
    cityId: string,
    { meetingId, limit, administrativeBodyTypes, administrativeBodyIds }: MeetingSummariesArgs,
): Promise<MeetingSummary[]> {
    if (meetingId) {
        const summary = await getMeetingSummaryCached(cityId, meetingId);
        return summary ? [summary] : [];
    }
    const meetings = await getCouncilMeetingsForCityPublicCached(cityId, {
        limit, administrativeBodyTypes, administrativeBodyIds, timeFilter: 'past',
    });
    const summaries = await Promise.all(meetings.map(meeting => getMeetingSummaryCached(cityId, meeting.id)));
    return summaries.filter((summary): summary is MeetingSummary => summary !== null);
}
