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

/**
 * What Notis says about this reader: a subscription's status, `null` when
 * he has none (or there is no Notis to ask), `unknown` when he did not
 * answer — which is not the same as none.
 */
export type NotisStatus = 'active' | 'unsubscribed' | 'unknown' | null;

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
    const { existing, account, notisStatus } = input;
    // A reader who said ΣΤΟΠ is not resubscribed by editing their topics, in
    // this municipality or a new one: the card starts unticked for them, and
    // only an explicit tick re-enables the channel. When Notis did not answer,
    // the reader may be one of them, so the same explicit tick is asked for.
    // Everyone else starts with WhatsApp on — it is the recommended channel —
    // and email off, as the design proposes it.
    const phoneChannel =
        notisStatus === 'unsubscribed' || notisStatus === 'unknown' ? false : existing ? existing.notifyByPhone : true;
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

/**
 * What the signup has to tell Notis after the save, if anything. A ticked
 * card from a reader he does not serve (or may not: he did not answer) is
 * the explicit re-activation; an unticked card from a reader he serves may
 * release him, once the server confirms no other municipality keeps the
 * phone channel. A signed-out reader and a reader with no subscription are
 * the poller's, which enrolls on the flag.
 */
export function notisActionFor(state: SignupState, signedIn: boolean, notisStatus: NotisStatus): 'activate' | 'release' | null {
    if (!signedIn) return null;
    if (state.phoneChannel) return notisStatus === 'unsubscribed' || notisStatus === 'unknown' ? 'activate' : null;
    return notisStatus === 'active' ? 'release' : null;
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
