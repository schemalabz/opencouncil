import type * as z from 'zod';
import { takesPlace } from '@/lib/meetingLifecycleRules';
import type { meetingFormSchema } from '@/lib/zod-schemas/meeting';

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

/**
 * The lifecycle fields as meetingFormSchema hands them to the submit: the
 * reason and the place are trimmed, and an empty one is null. The session
 * number is still the text of its input. A null kind or format is
 * «Από την πρόσκληση». `none` in postponedFromId is the Select's value for
 * "not the new meeting of a postponement".
 */
export type MeetingFormLifecycleValues = Pick<
    z.output<typeof meetingFormSchema>,
    'kind' | 'urgent' | 'scheduleStatus' | 'scheduleStatusReason' | 'sessionNumber' | 'format' | 'closedToPublic' | 'place' | 'postponedFromId'
>;

/**
 * The lifecycle fields of the request body. An empty input clears the value.
 * The body has no name: the name is derived. The reason belongs to a
 * postponed or cancelled meeting only. The link to a
 * postponed meeting is sent only when the admin changed it: the page payload
 * of a meeting hides its link, so an untouched field may not hold the link.
 * A city outside Greece has no kind, no urgency and no session number
 * (`recordsGreekCodeFacts`), so the body leaves them out.
 */
export function meetingRequestFields(
    values: MeetingFormLifecycleValues,
    { linkChanged, greekCodeFacts }: { linkChanged: boolean; greekCodeFacts: boolean },
) {
    const number = values.sessionNumber?.trim();
    return {
        kind: greekCodeFacts ? values.kind : undefined,
        urgent: greekCodeFacts ? values.urgent : undefined,
        scheduleStatus: values.scheduleStatus,
        scheduleStatusReason: takesPlace(values) ? null : values.scheduleStatusReason ?? null,
        sessionNumber: !greekCodeFacts ? undefined : number ? Number(number) : null,
        format: values.format,
        closedToPublic: values.closedToPublic,
        place: values.place ?? null,
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
