/**
 * Fetch-window derivation for decision polling (issue #617 phase 3).
 *
 * The window's only job is to be wide enough — the declared session date does
 * the precise work. Derived from the city's measured publication lags so it
 * self-tunes as data accumulates; nothing is stored and there is no
 * configuration to keep correct. Measured p95 lag is ≤21 days for every city.
 */

const DEFAULT_WINDOW_DAYS = 30;
const MIN_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 45;
const MIN_SAMPLE = 10;
const HEADROOM = 1.5;


/** p95 of the city's publish-lag history (days), with headroom, clamped. */
export function deriveWindowDays(lagsDays: number[]): number {
    const lags = lagsDays.filter((d) => d >= 0).sort((a, b) => a - b);
    if (lags.length < MIN_SAMPLE) return DEFAULT_WINDOW_DAYS;
    const p95 = lags[Math.min(lags.length - 1, Math.floor(lags.length * 0.95))];
    return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.ceil(p95 * HEADROOM)));
}
