import type { Topic } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { Location } from '@/lib/types/onboarding';

/**
 * The signup's state and rules, kept apart from React so they can be tested
 * without a browser: what the three steps start from, when the delivery step
 * may submit, and what the save action receives.
 */

export type SignupStep = 1 | 2 | 3;

export interface ExistingPreference {
    locations: Location[];
    topics: Topic[];
    notifyByPhone: boolean;
    notifyByEmail: boolean;
}

export interface SignupAccount {
    name: string;
    email: string;
    phone: string | null;
}

export type NotisStatus = 'active' | 'unsubscribed' | null;

export interface SignupState {
    step: SignupStep;
    locations: Location[];
    topics: Topic[];
    phoneChannel: boolean;
    emailChannel: boolean;
    phone: string;
    name: string;
    email: string;
}

export function initialSignupState(input: {
    initialStep: SignupStep;
    existing: ExistingPreference | null;
    account: SignupAccount | null;
    notisStatus: NotisStatus;
}): SignupState {
    const { existing, account } = input;
    // A reader who said ΣΤΟΠ is not resubscribed by editing their topics: the
    // card starts unticked for them, and only an explicit tick re-enables the
    // channel. Everyone else starts with WhatsApp on — it is the recommended
    // channel — and email off, as the design proposes it.
    const phoneChannel = existing
        ? existing.notifyByPhone && input.notisStatus !== 'unsubscribed'
        : true;
    return {
        step: input.initialStep,
        locations: existing?.locations ?? [],
        topics: existing?.topics ?? [],
        phoneChannel,
        emailChannel: existing?.notifyByEmail ?? false,
        phone: account?.phone ?? '',
        name: account?.name ?? '',
        email: account?.email ?? '',
    };
}

export type SignupIssue = 'no_channel' | 'phone_missing' | 'phone_invalid' | 'name_missing' | 'email_invalid';

const EMAIL_RE = /.+@.+\..+/;

/** What stops the delivery step from submitting, in display order. */
export function channelIssues(
    state: SignupState,
    opts: { phoneEmpty: boolean; phoneValid: boolean; signedIn: boolean },
): SignupIssue[] {
    const issues: SignupIssue[] = [];
    if (!state.phoneChannel && !state.emailChannel) issues.push('no_channel');
    if (state.phoneChannel) {
        if (opts.phoneEmpty) issues.push('phone_missing');
        else if (!opts.phoneValid) issues.push('phone_invalid');
    }
    if (!opts.signedIn) {
        if (!state.name.trim()) issues.push('name_missing');
        if (!EMAIL_RE.test(state.email.trim())) issues.push('email_invalid');
    }
    return issues;
}

export interface SignupSubmission {
    cityId: string;
    locations: { text: string; coordinates: [number, number] }[];
    topicIds: string[];
    notifyByPhone: boolean;
    notifyByEmail: boolean;
    phone?: string;
    name?: string;
    email?: string;
}

/**
 * What the save action receives. A declined WhatsApp card sends no phone,
 * so the account keeps whatever number it has; a signed-in reader's name and
 * email are the account's, never the form's.
 */
export function buildSubmission(state: SignupState, cityId: string, signedIn: boolean): SignupSubmission {
    return {
        cityId,
        locations: state.locations.map(({ text, coordinates }) => ({ text, coordinates })),
        topicIds: state.topics.map((topic) => topic.id),
        notifyByPhone: state.phoneChannel,
        notifyByEmail: state.emailChannel,
        ...(state.phoneChannel && state.phone ? { phone: state.phone } : {}),
        ...(signedIn ? {} : { name: state.name.trim(), email: state.email.trim() }),
    };
}

/** The save action's error codes, as message keys under `errors`. */
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
 * on the completion screen, not enough for a shoulder to read it.
 */
export function maskPhone(e164: string): string {
    const parsed = parsePhoneNumberFromString(e164);
    const national = parsed?.nationalNumber ?? e164.replace(/\D/g, '');
    const head = national.slice(0, 3);
    const tail = national.slice(-4);
    const country = parsed ? `+${parsed.countryCallingCode} ` : '';
    return `${country}${head} ··· ${tail}`;
}
