/**
 * Normalize a phone number to E.164-ish form: trim whitespace, ensure a
 * leading `+`. Returns empty string for nullish/empty input.
 */
export function normalizePhone(phone: string | null | undefined): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}
