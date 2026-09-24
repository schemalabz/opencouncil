import type { MeetingKind } from '@prisma/client';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatNumericDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';

/**
 * What the display name of a meeting is read from. `name`/`name_en` hold an
 * override only; null means that the name is derived.
 */
export interface MeetingNameFields {
    name: string | null;
    name_en: string | null;
    kind: MeetingKind | null;
    dateTime: Date | string;
    administrativeBody: { name: string; name_en: string } | null;
}

/**
 * The words that municipalities print on the invitation. A regular meeting
 * carries no kind word, as in the archive («Δημοτικό Συμβούλιο 12/03/2026»).
 * The SQL function `council_meeting_display_name` repeats the Greek labels.
 */
export const MEETING_KIND_LABELS: Record<'el' | 'en', Record<Exclude<MeetingKind, 'regular'>, string>> = {
    el: {
        urgent: 'Έκτακτη Συνεδρίαση',
        accountability: 'Ειδική Συνεδρίαση Λογοδοσίας',
        annualReport: 'Ειδική Συνεδρίαση Απολογισμού',
        budget: 'Ειδική Συνεδρίαση Προϋπολογισμού',
        presidencyElection: 'Ειδική Συνεδρίαση Εκλογής Προεδρείου',
    },
    en: {
        urgent: 'Urgent Meeting',
        accountability: 'Special Meeting (Accountability)',
        annualReport: 'Special Meeting (Annual Report)',
        budget: 'Special Meeting (Budget)',
        presidencyElection: 'Special Meeting (Presidency Election)',
    },
};

const NO_BODY_LABEL: Record<'el' | 'en', string> = { el: 'Συνεδρίαση', en: 'Meeting' };

/**
 * The name of a meeting for a locale: the override when an admin set one,
 * otherwise the administrative body, the kind and the date in the city's
 * timezone. The body name is stored in the nominative, so the kind follows a
 * dash instead of an inflected «Έκτακτη Συνεδρίαση Δημοτικού Συμβουλίου».
 *
 * The kind words exist in Greek and English. The other locales (French,
 * Serbian) get the body and the date.
 */
export function meetingDisplayName(meeting: MeetingNameFields, locale: string, timezone: string): string {
    const override = locale === 'en' ? meeting.name_en : meeting.name;
    if (override) return localizeText(override, locale);

    const labels = locale === 'en' ? 'en' : locale === 'el' ? 'el' : null;
    const body = meeting.administrativeBody
        ? getLocalizedName(meeting.administrativeBody, locale)
        : NO_BODY_LABEL[labels ?? 'en'];
    const kind = labels && meeting.kind && meeting.kind !== 'regular'
        ? ` — ${MEETING_KIND_LABELS[labels][meeting.kind]}`
        : '';
    return `${body}${kind} ${formatNumericDate(new Date(meeting.dateTime), timezone, locale)}`;
}
