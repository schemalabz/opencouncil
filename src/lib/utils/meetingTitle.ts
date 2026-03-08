import { formatDate } from '@/lib/formatters/time';

/**
 * Generates a display title for a meeting from its administrative body name and date.
 *
 * Per issue #209, council meetings don't need custom names — the administrative body
 * they belong to plus the date is sufficient. This utility centralizes that logic so
 * every surface (cards, breadcrumbs, OG images, exports, notifications, etc.) shows
 * a consistent title.
 *
 * @example
 * getMeetingDisplayTitle(meeting)           // "Δημοτικό Συμβούλιο — 15 Μαρτίου 2026"
 * getMeetingDisplayTitle(meeting, 'en')     // "Municipal Council — March 15, 2026"
 * getMeetingDisplayTitle(meeting, 'el', tz) // with timezone
 */
export function getMeetingDisplayTitle(
  meeting: {
    dateTime: Date | string;
    administrativeBody?: {
      name: string;
      name_en: string;
    } | null;
  },
  locale: string = 'el',
  timezone?: string,
): string {
  const date = meeting.dateTime instanceof Date ? meeting.dateTime : new Date(meeting.dateTime);

  // Format date using the existing el-GR formatter (e.g. "15 Μαρτίου 2026")
  const formattedDate = formatDate(date, timezone);

  const bodyName = meeting.administrativeBody
    ? (locale === 'en' ? meeting.administrativeBody.name_en : meeting.administrativeBody.name)
    : undefined;

  if (bodyName) {
    return `${bodyName} \u2014 ${formattedDate}`;
  }

  // Fallback: date only (should be rare once administrativeBody is required)
  return formattedDate;
}
