/**
 * Generate a meeting ID slug from a date.
 * Example: 2026-04-20 → "apr20_2026"
 */
export function formatDateAsMeetingId(date: Date): string {
    // Deterministic despite the raw toLocaleDateString: locale and timezone are
    // pinned. The produced strings are persisted meeting IDs, so a formatter
    // swap would change the IDs.
    // eslint-disable-next-line no-restricted-syntax
    return date
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Europe/Athens' })
        .toLowerCase()
        .replace(/\s/g, '')
        .replace(',', '_');
}
