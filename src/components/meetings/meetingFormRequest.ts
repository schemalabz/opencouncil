import type { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';

/**
 * The id that the meeting form sends. PUT identifies the meeting by the URL,
 * so an edit sends none. A new meeting sends an id only when the admin typed
 * one: without it the API makes the id from the date, and adds _2, _3 when the
 * day already has a meeting. A typed id that is taken fails, as it should.
 */
export function meetingIdForRequest(typedId: string | undefined, editing: boolean): string | undefined {
    if (editing) return undefined;
    return typedId?.trim() || undefined;
}

/** The lifecycle fields as the form holds them: every input is a string. */
export interface MeetingFormLifecycleValues {
    name?: string;
    name_en?: string;
    /** Null only on an archive meeting whose kind nobody has set. */
    kind: MeetingKind | null;
    scheduleStatus: MeetingScheduleStatus;
    scheduleStatusReason?: string;
    sessionNumber?: string;
    format: MeetingFormat;
    closedToPublic: boolean;
    place?: string;
    /** `none` is the Select's sentinel for "not the new meeting of a postponement". */
    postponedFromId?: string;
}

/**
 * The lifecycle fields of the request body. An empty input clears the value:
 * an empty name removes the override, so the name is derived again. The
 * reason belongs to a postponed or cancelled meeting only. The link to a
 * postponed meeting is sent only when the admin changed it: the page payload
 * of a meeting hides its link, so an untouched field may not hold the link.
 */
export function meetingRequestFields(values: MeetingFormLifecycleValues, { linkChanged }: { linkChanged: boolean }) {
    const text = (value: string | undefined) => value?.trim() || null;
    const number = values.sessionNumber?.trim();
    return {
        name: text(values.name),
        name_en: text(values.name_en),
        kind: values.kind,
        scheduleStatus: values.scheduleStatus,
        scheduleStatusReason: values.scheduleStatus === 'scheduled' ? null : text(values.scheduleStatusReason),
        sessionNumber: number ? Number(number) : null,
        format: values.format,
        closedToPublic: values.closedToPublic,
        place: text(values.place),
        postponedFromId: !linkChanged
            ? undefined
            : !values.postponedFromId || values.postponedFromId === 'none' ? null : values.postponedFromId,
    };
}

/** How far the postponed-meeting picker looks before and after the meeting. */
export const POSTPONEMENT_WINDOW_DAYS = 60;

/**
 * The editor list that the postponed-meeting picker reads: every meeting of
 * the city in a window around the date of the meeting, unreleased meetings and
 * their links included. A postponed meeting and its new meeting are close in
 * time, so the window holds both. The URL sets no limit, so the list is the
 * whole window.
 */
export function postponementCandidatesUrl(cityId: string, around: Date): string {
    const day = 24 * 60 * 60 * 1000;
    const from = new Date(around.getTime() - POSTPONEMENT_WINDOW_DAYS * day).toISOString();
    const to = new Date(around.getTime() + POSTPONEMENT_WINDOW_DAYS * day).toISOString();
    return `/api/cities/${cityId}/meetings?includeUnreleased=true&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}
