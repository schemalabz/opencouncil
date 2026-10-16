import type { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import type { UnreleasedScope } from '@/lib/unreleased';
import { formatRules } from '@/lib/meetingLifecycleRules';
import { meetingDisplayName, meetingLabel, type MeetingNameFields } from '@/lib/meetingName';

/**
 * The public projections of a meeting. The new meeting of a postponement
 * carries `postponedFromId`, and the postponed meeting is not public once its
 * new meeting is released. A reader may learn the date for which the meeting
 * was first scheduled, but never the id of the hidden meeting. The first
 * part of a continuation may be a draft, so its id stays private too.
 */

/**
 * Where a meeting takes place: its own place, else the hall of its body. Null
 * for a format that has no place, such as a remote meeting.
 */
export function effectivePlace(
    meeting: { format: MeetingFormat | null; place: string | null; administrativeBody?: { place?: string | null } | null },
): string | null {
    if (!formatRules(meeting.format).showsPlace) return null;
    return meeting.place ?? meeting.administrativeBody?.place ?? null;
}

/**
 * A row for a server-rendered page or a public list: the same shape, with no
 * link to another meeting and no municipal minutes. A municipality can hand
 * us minutes that it does not publish (#876), so their URL is for the
 * administrators of the meeting only; the edit form reads it from the editor
 * list. Every public payload of a meeting goes through here.
 */
export function hideLinks<T extends { postponedFromId: string | null; continuationOfId: string | null; municipalMinutesUrl?: string | null }>(row: T): T {
    return {
        ...row,
        postponedFromId: null,
        continuationOfId: null,
        ...('municipalMinutesUrl' in row && { municipalMinutesUrl: null }),
    };
}

/**
 * The editor rows of a list, with the municipal minutes only where the
 * caller edits the meeting. A body admin reads the released meetings of every
 * body of the city, and the minutes of another body may be unpublished (#876).
 * A meeting with no body is the city's, so only a city editor reads its minutes.
 */
export function hideMinutesOutsideScope<T extends { administrativeBodyId: string | null; municipalMinutesUrl: string | null }>(
    rows: T[],
    scope: UnreleasedScope,
): T[] {
    if (scope.all) return rows;
    const editable = new Set(scope.bodyIds);
    return rows.map(row => row.administrativeBodyId && editable.has(row.administrativeBodyId) ? row : { ...row, municipalMinutesUrl: null });
}

type RecordSource = {
    scheduleStatus: MeetingScheduleStatus;
    scheduleStatusReason: string | null;
    kind: MeetingKind | null;
    urgent: boolean;
    sessionNumber: number | null;
    format: MeetingFormat | null;
    closedToPublic: boolean;
    place: string | null;
    administrativeBody?: { place?: string | null } | null;
};

/**
 * The record of a meeting as a reader may see it: whether it takes place,
 * its kind, urgency, number and format, and where. The REST API and the MCP tools
 * both return it.
 */
export function publicRecordFields(meeting: RecordSource, postponedFromDate: Date | null) {
    return {
        scheduleStatus: meeting.scheduleStatus,
        scheduleStatusReason: meeting.scheduleStatusReason,
        kind: meeting.kind,
        urgent: meeting.urgent,
        sessionNumber: meeting.sessionNumber,
        format: meeting.format,
        closedToPublic: meeting.closedToPublic,
        place: effectivePlace(meeting),
        postponedFromDate: postponedFromDate?.toISOString() ?? null,
    };
}

type ApiMeetingSource = MeetingNameFields & RecordSource & {
    postponedFromId: string | null;
    continuationOfId: string | null;
    municipalMinutesUrl?: string | null;
    continuationOf?: unknown;
    hiddenByPostponement?: boolean;
    administrativeBody?: (MeetingNameFields['administrativeBody'] & { place?: string | null }) | null;
};

type ReplacedKeys = 'postponedFromId' | 'continuationOfId' | 'continuationOf' | 'hiddenByPostponement' | 'municipalMinutesUrl' | 'name' | 'name_en' | 'place';

export type PublicApiMeeting<T extends ApiMeetingSource> = Omit<T, ReplacedKeys>
    & ReturnType<typeof publicRecordFields>
    & { name: string; name_en: string; title: string; title_en: string };

/**
 * A meeting in a public API response. `name` and `name_en` hold the label,
 * which a client can print on its own, as it did before the names were
 * derived. `title` and `title_en` hold the short title. The links to other
 * meetings and the municipal minutes are left out.
 */
export function toPublicApiMeeting<T extends ApiMeetingSource>(
    row: T,
    { timezone, postponedFromDate }: { timezone: string; postponedFromDate: Date | null },
): PublicApiMeeting<T> {
    const {
        postponedFromId: _postponed, continuationOfId: _continuation, continuationOf: _firstPart, hiddenByPostponement: _hidden,
        municipalMinutesUrl: _minutes, name: _name, name_en: _nameEn, place: _place, ...rest
    } = row;
    return {
        ...rest,
        ...publicRecordFields(row, postponedFromDate),
        name: meetingLabel(row, 'el', timezone),
        name_en: meetingLabel(row, 'en', timezone),
        title: meetingDisplayName(row, 'el', timezone),
        title_en: meetingDisplayName(row, 'en', timezone),
    };
}
