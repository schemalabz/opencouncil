import { meetingDisplayName, type MeetingNameFields } from '@/lib/meetingName';

/**
 * The public projections of a meeting. The new meeting of a postponement
 * carries `postponedFromId`, and the postponed meeting is not public once its
 * new meeting is released. A reader may learn the date for which the meeting
 * was first scheduled, but never the id of the hidden meeting.
 */

/** The place of an in-person meeting: its own place, else the hall of its body. */
export function effectivePlace(
    meeting: { place: string | null; administrativeBody?: { place?: string | null } | null },
): string | null {
    return meeting.place ?? meeting.administrativeBody?.place ?? null;
}

/** A row for a server-rendered page or a public list: the same shape, with no link to the hidden meeting. */
export function hidePostponedFrom<T extends { postponedFromId: string | null }>(row: T): T {
    return { ...row, postponedFromId: null };
}

type ApiMeetingSource = MeetingNameFields & {
    postponedFromId: string | null;
    place: string | null;
    administrativeBody?: (MeetingNameFields['administrativeBody'] & { place?: string | null }) | null;
};

export type PublicApiMeeting<T extends ApiMeetingSource> = Omit<T, 'postponedFromId' | 'name' | 'name_en' | 'place'> & {
    name: string;
    name_en: string;
    place: string | null;
    postponedFromDate: string | null;
};

/**
 * A meeting in a public API response. `name` and `name_en` hold the display
 * names, so a client of the API reads a name for every meeting, as it did
 * before the names were derived. The key `postponedFromId` is left out.
 */
export function toPublicApiMeeting<T extends ApiMeetingSource>(
    row: T,
    { timezone, postponedFromDate }: { timezone: string; postponedFromDate: Date | null },
): PublicApiMeeting<T> {
    const { postponedFromId: _hidden, name: _name, name_en: _nameEn, place: _place, ...rest } = row;
    return {
        ...rest,
        name: meetingDisplayName(row, 'el', timezone),
        name_en: meetingDisplayName(row, 'en', timezone),
        place: effectivePlace(row),
        postponedFromDate: postponedFromDate?.toISOString() ?? null,
    };
}
