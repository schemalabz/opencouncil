/**
 * Generate a meeting ID slug from a date.
 * Example: 2026-04-20 → "apr20_2026"
 */
export function formatDateAsMeetingId(date: Date): string {
    return date
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Europe/Athens' })
        .toLowerCase()
        .replace(/\s/g, '')
        .replace(',', '_');
}
