/**
 * Dates as the model should read them: Athens-local, with the weekday and
 * how far from now, computed here and never by the model. In production the
 * model received UTC timestamps alone and wrote «χθες» for a meeting held
 * the same day or three days earlier in a third of the messages that used
 * the word, and named the wrong weekday in 83 of 193 cases.
 */

import { TZ } from "@/lib/active-hours";

const WEEKDAYS_EL = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];

interface AthensParts {
  weekday: number; // 0 = Sunday
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  /** Days since the Unix epoch of the Athens calendar day. */
  dayIndex: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function athensParts(date: Date): AthensParts {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) parts[p.type] = p.value;
  // Intl renders midnight as "24" with hour12:false in some engines.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const dayIndex = Math.floor(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000,
  );
  return {
    weekday: SHORT_WEEKDAYS.indexOf(parts.weekday),
    day: parts.day,
    month: parts.month,
    year: parts.year,
    hour,
    minute: parts.minute,
    dayIndex,
  };
}

/** «σήμερα», «χθες», «πριν 3 ημέρες», «αύριο», «σε 5 ημέρες» — relative to
 *  the Athens calendar day of `now`. */
export function relativeDayLabel(date: Date, now: Date): string {
  const diff = athensParts(date).dayIndex - athensParts(now).dayIndex;
  if (diff === 0) return "σήμερα";
  if (diff === -1) return "χθες";
  if (diff === 1) return "αύριο";
  if (diff < 0) return `πριν ${-diff} ημέρες`;
  return `σε ${diff} ημέρες`;
}

/** «Τετάρτη 23/09/2026». */
export function athensDate(date: Date): string {
  const p = athensParts(date);
  return `${WEEKDAYS_EL[p.weekday]} ${p.day}/${p.month}/${p.year}`;
}

/** «Τετάρτη 23/09/2026 19:00 ώρα Αθήνας». */
export function athensDateTime(date: Date): string {
  const p = athensParts(date);
  return `${athensDate(date)} ${p.hour}:${p.minute} ώρα Αθήνας`;
}

/**
 * The line the event block shows for a meeting date: the weekday and the
 * Athens date, the clock when the value carries one, then how far from now.
 * A date-only value, or a midnight-UTC instant (no council meets at 03:00),
 * has no clock: rendered, it would put the meeting at two in the morning.
 * An unparseable date renders as it came.
 */
export function describeMeetingDate(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hasClock =
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) && !(date.getUTCHours() === 0 && date.getUTCMinutes() === 0);
  return `${hasClock ? athensDateTime(date) : athensDate(date)}, ${relativeDayLabel(date, now)}`;
}

/** The <current_time> line: the ISO instant, then the Athens reading of it. */
export function describeNow(now: Date): string {
  return `${now.toISOString()} — ${athensDateTime(now)}`;
}
