import type { MeetingKind } from '@prisma/client';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatNumericDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';
import { meetingTitle, type MeetingKindName } from '@opencouncil/ui/lib/meeting-title';

/**
 * What the display name of a meeting is read from. Nothing writes
 * `name`/`name_en` any more: they hold the legacy stored name, which a
 * meeting without a kind falls back to until the archive backfill clears it.
 */
export interface MeetingNameFields {
    name: string | null;
    name_en: string | null;
    kind: MeetingKind | null;
    urgent: boolean;
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
 * The legacy stored name in the language of the locale, as the names were
 * read before they became legacy: `name_en` for English when it is set,
 * otherwise `name`.
 */
function storedName(meeting: MeetingNameFields, locale: string): string | null {
    return (locale === 'en' && meeting.name_en) || meeting.name || null;
}

/** The title by the shared rule (`meetingTitle`), in the script of the locale. */
function title(meeting: MeetingNameFields, locale: string, timezone: string) {
    const result = meetingTitle(
        { storedName: storedName(meeting, locale), kind: meeting.kind, sessionNumber: meeting.sessionNumber, urgent: meeting.urgent },
        locale,
        () => meetingDate(meeting, locale, timezone),
    );
    return { ...result, text: localizeText(result.text, locale) };
}

function meetingDate(meeting: MeetingNameFields, locale: string, timezone: string): string {
    return formatNumericDate(new Date(meeting.dateTime), timezone, locale);
}

/**
 * The title of a meeting for a locale: the session number and the kind,
 * «3η Τακτική». A meeting without a kind shows its legacy stored name, or
 * else «Συνεδρίαση 12/03/2026». The title of a known kind has no body and no
 * date. Use it where the body and the date are shown next to it: the meeting
 * page, the cards, a list of one body. Everywhere else, use `meetingLabel`.
 */
export function meetingDisplayName(meeting: MeetingNameFields, locale: string, timezone: string): string {
    return title(meeting, locale, timezone).text;
}

/** `meetingDisplayName` for a row that carries the timezone of its city. */
export function meetingNameInCity(meeting: MeetingNameFields & { city: { timezone: string } }, locale: string): string {
    return meetingDisplayName(meeting, locale, meeting.city.timezone);
}

/**
 * The name of a meeting for a reader that prints it alone: an alert, an
 * email, a feed, a share text, a tool result. It adds the body and the date
 * to the title: «Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026». A legacy
 * stored name is the whole label, because it already says the body and the
 * date. Pass `date: false` where the date is already printed next to the
 * label.
 */
export function meetingLabel(
    meeting: MeetingNameFields,
    locale: string,
    timezone: string,
    { date = true }: { date?: boolean } = {},
): string {
    const { text, dated, wholeLabel } = title(meeting, locale, timezone);
    if (wholeLabel) return text;
    const body = meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null;
    return [body, text, date && !dated ? meetingDate(meeting, locale, timezone) : null]
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
 * («Συνεδρίαση 12/03/2026»). A legacy stored name may not, so the date follows it.
 */
export function meetingDatedLabel(meeting: MeetingNameFields, locale: string, timezone: string): string {
    const label = meetingLabel(meeting, locale, timezone);
    const date = meetingDate(meeting, locale, timezone);
    return label.includes(date) ? label : `${label} · ${date}`;
}
