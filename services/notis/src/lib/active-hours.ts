/**
 * Quiet hours for proactive sends: 23:00–09:00 Europe/Athens (PRD §6).
 * A wake we initiate is held to the next 09:00 and released with jitter,
 * never dropped; reactive replies never pass through here. Pure and
 * Intl-based — the house pattern (metrics.ts buckets the same way), no
 * timezone library. Greece-only launch: when a second realm ships, the
 * timezone comes from the meeting/subscription rows instead of this
 * constant.
 */

export const TZ = "Europe/Athens";
export const QUIET_START_HOUR = 23;
export const QUIET_END_HOUR = 9;
export const QUIET_RELEASE_JITTER_MS = 45 * 60_000;

const hourFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  hourCycle: "h23",
});

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function athensHour(date: Date): number {
  return Number(hourFormat.format(date));
}

export function isQuietHour(date: Date): boolean {
  const hour = athensHour(date);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * The next Athens 09:00 at or after `date`, DST-safe without a tz library:
 * Athens is UTC+2 or UTC+3, so 09:00 local is 06:00Z or 07:00Z — format
 * both candidates and keep the one that lands on hour 9 of the right day.
 */
function nextRelease(date: Date): Date {
  // The Athens calendar date of `date`; if we are past 09:00 (i.e. in the
  // evening quiet stretch), the release is tomorrow.
  const [y, m, d] = dayFormat.format(date).split("-").map(Number);
  const sameDayUtc = Date.UTC(y, m - 1, d);
  const dayOffset = athensHour(date) >= QUIET_END_HOUR ? 1 : 0;
  for (const utcHour of [6, 7]) {
    const candidate = new Date(sameDayUtc + dayOffset * 86_400_000 + utcHour * 3_600_000);
    if (athensHour(candidate) === QUIET_END_HOUR) return candidate;
  }
  // Unreachable while Athens stays UTC+2/+3; fail toward the later instant.
  return new Date(sameDayUtc + dayOffset * 86_400_000 + 7 * 3_600_000);
}

/**
 * Inside active hours the instant passes through unchanged. Inside quiet
 * hours it moves to the next 09:00 Athens plus jitter, so the morning
 * release does not land every held send at the same second.
 */
export function clampToActiveHours(date: Date, rng: () => number = Math.random): Date {
  if (!isQuietHour(date)) return date;
  return new Date(nextRelease(date).getTime() + Math.floor(rng() * QUIET_RELEASE_JITTER_MS));
}

/** The next Athens 23:00 at or after `date` — the same two-candidate trick
 *  as nextRelease (23:00 local is 20:00Z or 21:00Z). */
function nextQuietStart(date: Date): Date {
  const [y, m, d] = dayFormat.format(date).split("-").map(Number);
  const sameDayUtc = Date.UTC(y, m - 1, d);
  for (const utcHour of [20, 21]) {
    const candidate = new Date(sameDayUtc + utcHour * 3_600_000);
    if (candidate >= date && athensHour(candidate) === QUIET_START_HOUR) return candidate;
  }
  // Already past today's 23:00 (i.e. between midnight and 09:00 handles via
  // isQuietHour; this branch is the late-evening edge) — tomorrow's.
  for (const utcHour of [20, 21]) {
    const candidate = new Date(sameDayUtc + 86_400_000 + utcHour * 3_600_000);
    if (athensHour(candidate) === QUIET_START_HOUR) return candidate;
  }
  return new Date(sameDayUtc + 86_400_000 + 21 * 3_600_000);
}

export interface ActivePhase {
  phase: "active" | "quiet";
  /** When the current phase began: the 09:00 release (active) or the 23:00
   *  boundary (quiet) — countdown bars drain across [since, until]. */
  since: Date;
  /** When the current phase ends: the next 23:00 (active) or the next
   *  09:00 release (quiet), Athens time, jitter-free. */
  until: Date;
}

/** The Athens boundary instant (hour 9 or 23) on the calendar day of
 *  `date` shifted by `dayOffset`. */
function boundaryOn(date: Date, dayOffset: number, hour: 9 | 23): Date {
  const [y, m, d] = dayFormat.format(date).split("-").map(Number);
  const base = Date.UTC(y, m - 1, d) + dayOffset * 86_400_000;
  const candidates = hour === 9 ? [6, 7] : [20, 21];
  for (const utcHour of candidates) {
    const candidate = new Date(base + utcHour * 3_600_000);
    if (athensHour(candidate) === hour) return candidate;
  }
  return new Date(base + candidates[1] * 3_600_000);
}

/** Which side of the quiet-hours boundary `date` sits on, and when that
 *  phase began and ends — display fuel for the admin panel's countdowns. */
export function activePhase(date: Date): ActivePhase {
  if (isQuietHour(date)) {
    // Quiet spans midnight: before midnight it began today at 23:00,
    // after midnight it began yesterday at 23:00.
    const since =
      athensHour(date) >= QUIET_START_HOUR ? boundaryOn(date, 0, 23) : boundaryOn(date, -1, 23);
    return { phase: "quiet", since, until: clampToActiveHours(date, () => 0) };
  }
  return { phase: "active", since: boundaryOn(date, 0, 9), until: nextQuietStart(date) };
}
