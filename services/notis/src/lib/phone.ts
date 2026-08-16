/**
 * Normalize a phone number to E.164-ish form: trim whitespace, ensure a
 * leading `+`. Returns empty string for nullish/empty input. Mirrors the
 * main app's src/lib/notifications/phone.ts — stored formats are mixed
 * across both databases, so the read paths compensate identically.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}
