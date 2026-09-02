import { formatDistanceToNow } from 'date-fns';
import { el, enUS, fr, sr, srLatn, type Locale } from 'date-fns/locale';
import { type AppLocale, DEFAULT_LOCALE, LOCALE_TAGS } from '@/i18n/config';

// Typed against AppLocale (like LOCALE_TAGS) so adding a locale to LOCALES
// fails compilation until its date-fns locale is declared.
const DATE_FNS_LOCALES: Record<AppLocale, Locale> = {
    el,
    en: enUS,
    fr,
    sr,
    'sr-Latn': srLatn,
};

/**
 * Map a next-intl locale string to the corresponding date-fns Locale object.
 * Defaults to Greek to match the app's default locale.
 */
export function getDateFnsLocale(locale: string): Locale {
    return DATE_FNS_LOCALES[locale as AppLocale] ?? el;
}

/**
 * Map a next-intl locale string to the BCP 47 tag passed to `Intl.DateTimeFormat`
 * (the canonical tags live in `LOCALE_TAGS`). Defaults to Greek to match the
 * app's default locale.
 *
 * `formatNumericDateTime` deliberately does not use this — it pins `en-GB` so its
 * numeric output stays day-first in every locale.
 */
export function getIntlLocale(locale: string): string {
    return LOCALE_TAGS[locale as AppLocale] ?? LOCALE_TAGS[DEFAULT_LOCALE];
}

/**
 * The timezone that `formatDate`/`formatDateTime`/`formatNumericDateTime` use
 * when the caller does not pass one. An omitted timezone must never mean "the
 * machine's": the server renders in UTC and the browser in the visitor's zone,
 * so the same call would produce different text on each side and break
 * hydration (React error #418). Callers with a better zone in scope (a city's
 * timezone) should still pass it.
 */
export const DEFAULT_TIMEZONE = 'Europe/Athens';

/**
 * Formats time in seconds to a human-readable string
 * @param time - Time in seconds
 * @returns Formatted string like "5:30" or "1:23:45"
 */
export function formatTime(time: number): string {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats time in seconds to a fixed HH:MM:SS format
 * Always includes hours, minutes, and seconds padded with zeros
 * @param time - Time in seconds
 * @param showMilliseconds - Whether to include milliseconds (default: false)
 * @returns Formatted string like "00:05:30" or "01:23:45.123"
 */
export function formatTimestamp(time: number, showMilliseconds: boolean = false): string {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time % 1) * 1000);
  
  const baseTimestamp = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  if (showMilliseconds) {
    return `${baseTimestamp}.${milliseconds.toString().padStart(3, '0')}`;
  }
  
  return baseTimestamp;
}

/**
 * Formats duration in seconds to a human-readable string like "5m 30s"
 * @param seconds - Duration in seconds
 * @returns Formatted string
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Formats duration in milliseconds to a human-readable string like "2d 5h" or "3h 20m" or "45m"
 * @param ms - Duration in milliseconds
 * @returns Formatted string
 */
export function formatDurationMs(ms: number): string {
  if (ms === 0) return '0m';
  
  const totalMinutes = Math.round(ms / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  
  return parts.join(' ');
}

/**
 * Formats a date to a relative time string (e.g., "2 hours ago", "3 days ago").
 *
 * The output depends on the clock at render time, so the server and the
 * hydrating client routinely produce different strings. A server-rendered
 * element whose text comes from this function needs `suppressHydrationWarning`
 * (or the `RelativeTime` component, which also keeps the text fresh).
 *
 * @param date - The date to format
 * @param locale - The locale to use for formatting (defaults to 'el')
 * @param options - `addSuffix` controls the "ago"/"in" wording (defaults to true)
 * @returns Formatted relative time string in the specified locale
 */
export function formatRelativeTime(date: Date, locale: string = 'el', options?: { addSuffix?: boolean }): string {
  return formatDistanceToNow(date, {
    addSuffix: options?.addSuffix ?? true,
    locale: getDateFnsLocale(locale)
  });
}

/**
 * The calendar date of a moment in a timezone, as `YYYY-MM-DD`. Documents and
 * badges work in local dates, and a meeting stored at local midnight is stored
 * before midnight UTC — the UTC (or machine) date would off-by-one every
 * comparison for it. Always pass City.timezone; realms make Athens an
 * assumption, not a fact.
 */
export function localCalendarDate(d: Date, timeZone: string): string {
    return d.toLocaleDateString('en-CA', { timeZone });
}

/**
 * Numeric date, compact for tables and message strings: `DD/MM/YYYY`.
 * The date-only counterpart of `formatNumericDateTime`.
 *
 * @param date - The date to format
 * @param timezone - Optional timezone
 * @param locale - 'el' (default) or 'en'; both produce day-first numeric output
 * @returns e.g. "04/05/2026"
 */
/**
 * Presentation inverse of localCalendarDate: renders a city-local
 * 'YYYY-MM-DD' string. The string already names the calendar date, so no
 * timezone math applies — parse and format both use the viewer's zone.
 */
export function formatCalendarDate(date: string, locale: string = 'el'): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString(getIntlLocale(locale), {
        day: 'numeric', month: 'short', year: 'numeric',
    });
}

export function formatNumericDate(date: Date, timezone?: string, locale: string = 'el'): string {
    const options: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: timezone || DEFAULT_TIMEZONE,
    };
    // en-GB rather than en-US so English output stays day-first numeric.
    const intlLocale = locale === 'en' ? 'en-GB' : getIntlLocale(locale);
    return new Intl.DateTimeFormat(intlLocale, options).format(date);
}

/**
 * The long weekday name of a moment ("Δευτέρα", "Monday").
 *
 * @param date - The date to format
 * @param timezone - Optional timezone
 * @param locale - Optional locale (defaults to 'el')
 */
export function formatWeekday(date: Date, timezone?: string, locale: string = 'el'): string {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
        weekday: 'long',
        timeZone: timezone || DEFAULT_TIMEZONE,
    }).format(date);
}

/** A day and a time the way the meeting page promises them: "Τετάρτη 11 Φεβρουαρίου 2026 στις 15:00". */
export function formatWeekdayDateTime(date: Date, timezone?: string, locale: string = 'el'): string {
    return `${formatWeekday(date, timezone, locale)} ${formatDateTime(date, timezone, 'long', locale)}`;
}

/**
 * Formats a date to a standard string representation
 * @param date - The date to format
 * @param timezone - Optional timezone
 * @returns Formatted date string
 */
export function formatDate(date: Date, timezone?: string, locale: string = 'el'): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'long' };

  options.timeZone = timezone || DEFAULT_TIMEZONE;

  const intlLocale = getIntlLocale(locale);
  if (date instanceof Date) {
    return new Intl.DateTimeFormat(intlLocale, options).format(date);
  } else if (typeof date === 'string') {
    return new Intl.DateTimeFormat(intlLocale, options).format(new Date(date));
  } else {
    throw new Error(`Invalid date: ${date}`);
  }
}

/**
 * Numeric date-time, compact for tables/logs: `DD/MM/YYYY HH:mm:ss` (24h).
 * Useful where `formatDateTime`'s long month names are too verbose.
 *
 * @param date - The date to format
 * @param timezone - Optional timezone
 * @param locale - 'el' (default) or 'en'; both produce day-first numeric output
 * @param withSeconds - Include the seconds component (default: true)
 * @returns e.g. "04/05/2026 10:07:30"
 */
export function formatNumericDateTime(date: Date, timezone?: string, locale: string = 'el', withSeconds: boolean = true): string {
    const options: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...(withSeconds ? { second: '2-digit' as const } : {}),
        hour12: false,
    };
    options.timeZone = timezone || DEFAULT_TIMEZONE;

    // en-GB rather than en-US so English output stays day-first numeric.
    const intlLocale = locale === 'en' ? 'en-GB' : getIntlLocale(locale);
    return new Intl.DateTimeFormat(intlLocale, options).format(date).replace(', ', ' ');
}

/**
 * Formats a date and time to a standard string representation
 * @param date - The date to format
 * @param timezone - Optional timezone
 * @param dateStyle - Optional date style (defaults to 'long'; use 'medium'/'short' for compact contexts)
 * @param locale - Optional locale (defaults to 'el' to match the app's default locale)
 * @returns Formatted date and time string
 */
export function formatDateTime(date: Date, timezone?: string, dateStyle: 'long' | 'medium' | 'short' = 'long', locale: string = 'el'): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle,
    timeStyle: 'short',
    // Pin the hour cycle. CLDR defaults Greek to 12-hour ("2:00 μ.μ."), but
    // WebKit overrides the default with the device's 24-Hour Time setting, so
    // server HTML and Safari/iOS in-app browsers disagreed on every rendered
    // time and broke hydration (React error #418).
    hour12: false,
  };

  options.timeZone = timezone || DEFAULT_TIMEZONE;

  const intlLocale = getIntlLocale(locale);
  if (date instanceof Date) {
    return new Intl.DateTimeFormat(intlLocale, options).format(date);
  } else if (typeof date === 'string') {
    return new Intl.DateTimeFormat(intlLocale, options).format(new Date(date));
  } else {
    throw new Error(`Invalid date: ${date}`);
  }
}

/** The parts of a date-stamp: a large day numeral over a short month and year. */
export interface DateStampParts {
    day: string;
    /** Abbreviated month and two-digit year, e.g. "ΑΥΓ 26" — already uppercased. */
    monthYear: string;
}


/**
 * The stamp formatters' shared prologue: normalize (dates that have been
 * through unstable_cache come back as ISO strings), refuse garbage, and bind
 * the locale and timezone once. Both stamp formats compose from this so their
 * handling cannot drift.
 */
function stampContext(date: Date | string, timezone: string | undefined, locale: string) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) {
        throw new Error(`Invalid date: ${String(date)}`);
    }
    const intlLocale = getIntlLocale(locale);
    const part = (options: Intl.DateTimeFormatOptions): string =>
        new Intl.DateTimeFormat(intlLocale, timezone ? { ...options, timeZone: timezone } : options).format(value);
    return { intlLocale, part };
}

/** A timeline node's stamp — the day and short month, no year. */
export interface DayMonthStampParts {
    day: string;
    /** Abbreviated month, uppercased with the locale's own rules — Greek capitals drop their tonos. */
    month: string;
}

/**
 * The date-stamp without its year, for surfaces where every date is recent — a
 * year on each node of a meetings timeline would repeat itself down the page.
 * Same normalization and timezone handling as {@link formatDateStamp}.
 */
export function formatDayMonthStamp(date: Date | string, timezone?: string, locale: string = 'el'): DayMonthStampParts {
    const { intlLocale, part } = stampContext(date, timezone, locale);
    return {
        day: part({ day: 'numeric' }),
        month: part({ month: 'short' }).replace(/\./g, '').toLocaleUpperCase(intlLocale),
    };
}

/**
 * Splits a date into the parts a calendar-style stamp renders separately, so a
 * card can size the day numeral independently of the month.
 *
 * The month is abbreviated and uppercased because the stamp is read as a glance
 * target, not as prose; a full month name would compete with the title beside it.
 *
 * @param date - The date to format
 * @param timezone - The city's timezone; a meeting's local date is the one that matters
 * @param locale - Defaults to 'el' to match the app's default locale
 */
export function formatDateStamp(date: Date | string, timezone?: string, locale: string = 'el'): DateStampParts {
    const { intlLocale, part } = stampContext(date, timezone, locale);
    const day = part({ day: '2-digit' });
    const monthYear = part({ month: 'short', year: '2-digit' }).toLocaleUpperCase(intlLocale);
    return { day, monthYear };
}

/**
 * The clock time of a moment, in the council's timezone: "15:00".
 * Takes a string as well, like the stamps: a cached meeting's date arrives serialized.
 */
export function formatClockTime(date: Date | string, timezone?: string, locale: string = 'el'): string {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone || DEFAULT_TIMEZONE,
    }).format(new Date(date));
}

/** A deadline the way a chip has room for it: short weekday, day and month — "Παρ 13/2". */
export function formatShortDeadline(date: Date, timezone?: string, locale: string = 'el'): string {
    // en-GB rather than en-US so English output stays day-first numeric.
    const intlLocale = locale === 'en' ? 'en-GB' : getIntlLocale(locale);
    return new Intl.DateTimeFormat(intlLocale, {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
        timeZone: timezone || DEFAULT_TIMEZONE,
    }).format(date);
}

/**
 * Formats a gap duration in seconds to a Greek human-readable string
 * @param seconds - Gap duration in seconds
 * @returns Formatted string like "3 λεπτών" or "45 δευτ."
 */
export function formatGapDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes >= 1) {
        return `${minutes} λεπτ${minutes === 1 ? 'ού' : 'ών'}`;
    }
    return `${Math.round(seconds)} δευτ.`;
}

/**
 * A date range in words. Both callers pass a `Common`-scoped translator,
 * because the copy belongs to this helper rather than to either page.
 *
 * @translationNamespace Common
 */
export function formatDateRange(startDate: Date | null, endDate: Date | null, t: any): string {
  if (startDate && endDate) {
    return `${t('from')} ${formatDate(startDate)} ${t('until')} ${formatDate(endDate)}`;
  }
  if (startDate && !endDate) {
    return `${t('from')} ${formatDate(startDate)} ${t('until')} ${t('present')}`;
  }
  if (!startDate && endDate) {
    return `${t('until')} ${formatDate(endDate)}`;
  }
  return '';
}


/**
 * Whether two instants fall on the same calendar day in a given timezone.
 *
 * date-fns' `isToday` compares in the runtime's zone, which is the server's in
 * an RSC render and the reader's after hydration — neither is the council's. A
 * meeting is "today" when the municipality says it is.
 */
export function sameCalendarDay(a: Date | string, b: Date | string, timezone?: string): boolean {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  if (timezone) {
    options.timeZone = timezone;
  }
  const format = new Intl.DateTimeFormat('en-CA', options);
  const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));
  return format.format(toDate(a)) === format.format(toDate(b));
}
