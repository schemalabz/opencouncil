import type { Topic } from '@prisma/client';
import { accountIssues, type SignupAccount, type SignupIssue } from '@/components/signup/signup-shared';
import { type NotisStatus, phoneChannelFor } from '@/lib/notis/phone-channel';
import type { Location } from '@/lib/types/onboarding';

export type { SignupAccount } from '@/components/signup/signup-shared';
export type { NotisStatus } from '@/lib/notis/phone-channel';

/**
 * The signup's state and rules, kept apart from React so they can be tested
 * without a browser: what the three steps start from, when the delivery step
 * may submit, and what the save action receives.
 */

export type SignupStep = 1 | 2 | 3;

export interface ExistingPreference {
    locations: Location[];
    topics: Topic[];
    notifyByEmail: boolean;
}

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

/**
 * Where the WhatsApp card starts. Notis decides for a reader he knows: a
 * reader who said ΣΤΟΠ is not resubscribed by editing their topics, in this
 * municipality or a new one — the card starts unticked, and only an explicit
 * tick re-enables the channel. A reader Notis has not met starts from their
 * own request — Νότης is one conversation, whatever the municipality — and a
 * new reader with WhatsApp on, the recommended channel.
 *
 * When Notis does not answer, the card freezes on the reader's own request,
 * exactly as the profile switch does. It must never show OFF on a guess: the
 * save would write that guess over a subscription Notis still serves, and
 * nothing would ever reconcile the two. `phoneChannelLocked` keeps the card
 * from being changed or written while that is the case.
 */
export function phoneChannelDefault(notisStatus: NotisStatus, account: SignupAccount | null): boolean {
    if (!account) return true;
    return phoneChannelFor(notisStatus, account.notifyByPhone) ?? account.notifyByPhone;
}

/**
 * Whether the signup may touch the phone channel at all. It may not while
 * Notis has not answered: it cannot activate a reader who may have said ΣΤΟΠ,
 * and it cannot release one whose subscription it cannot confirm. The rest of
 * the step — places, topics, the email summary — saves as usual.
 */
export function phoneChannelLocked(notisStatus: NotisStatus): boolean {
    return notisStatus === 'unknown';
}

export function initialSignupState(input: {
    initialStep: SignupStep;
    existing: ExistingPreference | null;
    account: SignupAccount | null;
}): SignupState {
    const { existing, account } = input;
    return {
        step: input.initialStep,
        locations: existing?.locations ?? [],
        topics: existing?.topics ?? [],
        // Notis has not been asked yet; the answer replaces this before the
        // card shows. Email starts off, as the design proposes it.
        phoneChannel: phoneChannelDefault(null, account),
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
 * card from a reader he does not serve is the explicit re-activation; an
 * unticked card from a reader he serves releases him — the card is the
 * person's one consent, not a municipality's. A signed-out reader and a
 * reader with no subscription are the poller's, which enrolls on the flag.
 * While Notis has not answered, nothing is decided in either direction.
 */
export function notisActionFor(state: SignupState, signedIn: boolean, notisStatus: NotisStatus): 'activate' | 'release' | null {
    if (!signedIn || phoneChannelLocked(notisStatus)) return null;
    if (state.phoneChannel) return notisStatus === 'unsubscribed' ? 'activate' : null;
    return notisStatus === 'active' ? 'release' : null;
}

export interface SignupSubmission {
    cityId: string;
    locations: { text: string; coordinates: [number, number] }[];
    topicIds: string[];
    notifyByPhone?: boolean;
    notifyByEmail: boolean;
    phone?: string;
    name?: string;
    email?: string;
}

/**
 * What the save action receives. A declined WhatsApp card sends no phone, so
 * the account keeps whatever number it has; a signed-in reader's name and
 * email are the account's, never the form's. A locked card sends no consent
 * either: the save leaves `User.notifyByPhone` alone rather than write a
 * value the signup could not read.
 */
export function buildSubmission(
    state: SignupState,
    cityId: string,
    signedIn: boolean,
    opts: { phoneChannelLocked?: boolean } = {},
): SignupSubmission {
    return {
        cityId,
        locations: state.locations.map(({ text, coordinates }) => ({ text, coordinates })),
        topicIds: state.topics.map((topic) => topic.id),
        ...(opts.phoneChannelLocked ? {} : { notifyByPhone: state.phoneChannel }),
        notifyByEmail: state.emailChannel,
        ...(state.phoneChannel && state.phone ? { phone: state.phone } : {}),
        ...(signedIn ? {} : { name: state.name.trim(), email: state.email.trim() }),
    };
}
