import type { MeetingKind } from '@prisma/client';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatNumericDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';
import { meetingTitle, type MeetingKindName } from '@opencouncil/ui/lib/meeting-title';

/**
 * What the display name of a meeting is read from. `name`/`name_en` hold an
 * override only; null means that the name is derived.
 */
export interface MeetingNameFields {
    name: string | null;
    name_en: string | null;
    kind: MeetingKind | null;
    sessionNumber: number | null;
    dateTime: Date | string;
    administrativeBody?: { name: string; name_en: string } | null;
}

/**
 * The shared kind words (`@opencouncil/ui/lib/meeting-title`) cannot import
 * Prisma, so they declare the kinds themselves. This type is `true` only
 * when the two lists are equal: a new `MeetingKind` fails to compile here
 * until the shared module has words for it.
 */
type SameKinds = [MeetingKind] extends [MeetingKindName]
    ? [MeetingKindName] extends [MeetingKind] ? true : false
    : false;
export const MEETING_KINDS_MATCH: SameKinds = true;

/**
 * The derived title, and whether it carries the date. A title with a known
 * kind does not: «3η Τακτική». A null kind gives «Συνεδρίαση 12/03/2026».
 */
function derivedTitle(meeting: MeetingNameFields, locale: string, timezone: string): { text: string; dated: boolean } {
    const title = meetingTitle(
        { override: null, kind: meeting.kind, sessionNumber: meeting.sessionNumber },
        locale,
        () => meetingDate(meeting, locale, timezone),
    );
    return title.dated ? { text: localizeText(title.text, locale), dated: true } : title;
}

function override(meeting: MeetingNameFields, locale: string): string | null {
    const value = locale === 'en' ? meeting.name_en : meeting.name;
    return value ? localizeText(value, locale) : null;
}

function meetingDate(meeting: MeetingNameFields, locale: string, timezone: string): string {
    return formatNumericDate(new Date(meeting.dateTime), timezone, locale);
}

/**
 * The title of a meeting for a locale: the override when an admin set one,
 * otherwise the session number and the kind, «3η Τακτική». The title has no
 * body and, for a known kind, no date. Use it where the body and the date
 * are shown next to it: the meeting page, the cards, a list of one body.
 * Everywhere else, use `meetingLabel`.
 */
export function meetingDisplayName(meeting: MeetingNameFields, locale: string, timezone: string): string {
    return override(meeting, locale) ?? derivedTitle(meeting, locale, timezone).text;
}

/** `meetingDisplayName` for a row that carries the timezone of its city. */
export function meetingNameInCity(meeting: MeetingNameFields & { city: { timezone: string } }, locale: string): string {
    return meetingDisplayName(meeting, locale, meeting.city.timezone);
}

/**
 * The name of a meeting for a reader that prints it alone: an alert, an
 * email, a feed, a share text, a tool result. It adds the body and the date
 * to the title: «Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026». An override
 * stays as the admin wrote it. Pass `date: false` where the date is already
 * printed next to the label.
 */
export function meetingLabel(
    meeting: MeetingNameFields,
    locale: string,
    timezone: string,
    { date = true }: { date?: boolean } = {},
): string {
    const set = override(meeting, locale);
    if (set) return set;
    const title = derivedTitle(meeting, locale, timezone);
    const body = meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null;
    return [body, title.text, date && !title.dated ? meetingDate(meeting, locale, timezone) : null]
        .filter((part): part is string => !!part)
        .join(' · ');
}

/** `meetingLabel` for a row that carries the timezone of its city. */
export function meetingLabelInCity(
    meeting: MeetingNameFields & { city: { timezone: string } },
    locale: string,
    options?: { date?: boolean },
): string {
    return meetingLabel(meeting, locale, meeting.city.timezone, options);
}

/**
 * `meetingLabel` with the date once, for a reader that must show the date: a
 * feed item. A derived label carries the date, after the title or inside it
 * («Συνεδρίαση 12/03/2026»). A name override may not, so the date follows it.
 */
export function meetingDatedLabel(meeting: MeetingNameFields, locale: string, timezone: string): string {
    const label = meetingLabel(meeting, locale, timezone);
    const date = meetingDate(meeting, locale, timezone);
    return label.includes(date) ? label : `${label} · ${date}`;
}

/**
 * Whether a name is one that the platform derives for this meeting: its
 * label or its title, with or without the date. Such a name is no override.
 * The API returns the label in `name`, so a client that writes back the name
 * it read would otherwise freeze the body and the date of today.
 */
export function isDerivedName(name: string, meeting: MeetingNameFields, locale: string, timezone: string): boolean {
    const derived = { ...meeting, name: null, name_en: null };
    const forms = [
        meetingDisplayName(derived, locale, timezone),
        meetingLabel(derived, locale, timezone),
        meetingLabel(derived, locale, timezone, { date: false }),
    ];
    return forms.includes(name.trim());
}
