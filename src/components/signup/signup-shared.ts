import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * What the two signup flows — notifications and the petition — have in
 * common, kept apart from React so both can be tested without a browser:
 * the account a signed-in reader brings, the reasons a last step may refuse
 * to submit, the save actions' error codes, and the phone mask.
 */

/** The signed-in reader's account, prefilled into a flow's fields. */
export interface SignupAccount {
    name: string;
    email: string;
    phone: string | null;
}

/** Every reason a flow's last step may refuse to submit; each flow raises its own subset. */
export type SignupIssue =
    | 'no_channel'
    | 'phone_missing'
    | 'phone_invalid'
    | 'name_missing'
    | 'email_invalid'
    | 'relation_missing'
    | 'other_relation_missing';

const EMAIL_RE = /.+@.+\..+/;

/** The account fields a signed-out reader must fill: a name, and an email that looks like one. */
export function accountIssues(fields: { name: string; email: string }): SignupIssue[] {
    const issues: SignupIssue[] = [];
    if (!fields.name.trim()) issues.push('name_missing');
    if (!EMAIL_RE.test(fields.email.trim())) issues.push('email_invalid');
    return issues;
}

/** The save actions' error codes, as message keys under `signup.errors`. */
const SAVE_ERROR_KEYS: Record<string, string> = {
    phone_empty: 'phoneMissing',
    phone_invalid: 'phoneInvalid',
    phone_not_mobile: 'phoneNotMobile',
    phone_in_use: 'phoneInUse',
    email_exists: 'emailExists',
};

export function saveErrorKey(code: string): string {
    return SAVE_ERROR_KEYS[code] ?? 'generic';
}

/**
 * «+30 694 ··· 2297»: enough for the reader to recognise their own number
 * on a completion screen, not enough for a shoulder to read it.
 */
export function maskPhone(e164: string): string {
    const parsed = parsePhoneNumberFromString(e164);
    const national = parsed?.nationalNumber ?? e164.replace(/\D/g, '');
    const head = national.slice(0, 3);
    const tail = national.slice(-4);
    const country = parsed ? `+${parsed.countryCallingCode} ` : '';
    return `${country}${head} ··· ${tail}`;
}
