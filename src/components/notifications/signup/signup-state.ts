import type { Topic } from '@prisma/client';
import { accountIssues, type SignupAccount, type SignupIssue } from '@/components/signup/signup-shared';
import type { Location } from '@/lib/types/onboarding';

export type { SignupAccount } from '@/components/signup/signup-shared';

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
    if (!opts.signedIn) issues.push(...accountIssues(state));
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
