import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * One rule for every phone we store: strict E.164 with the country code
 * present, valid for its country, and of a type WhatsApp or SMS can reach.
 * The phone field (client), the profile and registration writes (server),
 * the release panel's eligibility and Notis's enrollment gate all go
 * through here, so a number accepted in one place is accepted everywhere.
 *
 * Why strict: the previous validator checked the national digits and
 * skipped every country but Greece, so a Greek mobile typed without its
 * `+30` was stored as `+6943472297` and failed on both channels.
 */

export type PhoneRejection = 'empty' | 'invalid' | 'landline';

export type MobilePhoneResult =
    | { ok: true; e164: string; country: string | undefined }
    | { ok: false; reason: PhoneRejection };

/** Error codes the server returns for a rejected phone, keyed by reason.
 *  `phone_in_use` (another account holds the number) is issued beside them. */
export const PHONE_REJECTION_CODES: Record<PhoneRejection, string> = {
    empty: 'phone_empty',
    invalid: 'phone_invalid',
    landline: 'phone_not_mobile',
};

/** Another account already holds the number — one handset is one reader. */
export const PHONE_IN_USE_CODE = 'phone_in_use';

// Number types a WhatsApp or SMS message can reach. FIXED_LINE_OR_MOBILE
// covers plans that do not split the two ranges (the US among them).
const REACHABLE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

/**
 * Parse a phone as the reader typed it, requiring the country code. No
 * default country: a number without one cannot be dialled, whatever the
 * reader meant by it.
 */
export function toMobileE164(input: string | null | undefined): MobilePhoneResult {
    const text = (input ?? '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    const parsed = parsePhoneNumberFromString(text);
    if (!parsed || !parsed.isValid()) return { ok: false, reason: 'invalid' };
    const type = parsed.getType();
    if (type === 'FIXED_LINE') return { ok: false, reason: 'landline' };
    // A valid number whose type the metadata does not know is kept:
    // refusing it would lock a real reader out over a metadata gap.
    if (type !== undefined && !REACHABLE_TYPES.has(type)) return { ok: false, reason: 'invalid' };
    return { ok: true, e164: parsed.number, country: parsed.country };
}

/**
 * The shapes the old input let through, repaired before parsing: a Greek
 * national number behind a bare `+`, or with no prefix at all. Ten digits
 * starting with 69 or 2 are a Greek mobile or landline and nothing else —
 * no number under +690, +691 or +692 is that long.
 */
export function repairGreekNational(input: string): string {
    const text = input.trim().replace(/[\s().-]/g, '');
    const match = /^\+?(69\d{8}|2\d{9})$/.exec(text);
    return match ? `+30${match[1]}` : text;
}

/** The server's entry point: repair the legacy shapes, then apply the rule. */
export function normalizeMobilePhone(input: string | null | undefined): MobilePhoneResult {
    if (input === null || input === undefined) return { ok: false, reason: 'empty' };
    return toMobileE164(repairGreekNational(input));
}

/** ISO 3166 country of a number, for the field's flag; null when unreadable. */
export function detectCountryFromPhone(phoneNumber: string): string | null {
    return parsePhoneNumberFromString(phoneNumber)?.country ?? null;
}

export function isPhoneValid(phoneNumber: string): boolean {
    return toMobileE164(phoneNumber).ok;
}

const CALLING_CODES = new Set(getCountries().map((country) => getCountryCallingCode(country)));

/** A bare dial code is what the input shows before the reader types, so it
 *  counts as empty — not as a phone, and not as an error. */
export function isPhoneEmpty(phone: string): boolean {
    if (!phone) return true;
    const digits = phone.replace(/\D/g, '');
    return digits === '' || CALLING_CODES.has(digits);
}
