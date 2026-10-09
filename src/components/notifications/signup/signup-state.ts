import type { Topic } from '@prisma/client';
import { accountIssues, type SignupAccount, type SignupIssue } from '@/components/signup/signup-shared';
import type { PublicAdministrativeBody } from '@/lib/db/types';
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

/**
 * What the signup is about (#829). `city`: the municipality's own meetings,
 * with the secondary bodies behind a tick. `bodies`: the secondary bodies
 * alone, in a municipality that does not support notifications.
 */
export type SignupScope = 'city' | 'bodies';

export interface ExistingPreference {
    /** The row, for the delete that a reader who unticks their last body asks for (preferencesAction). */
    id: string;
    locations: Location[];
    topics: Topic[];
    /** The secondary bodies of the municipality the reader follows (#829). */
    bodies: PublicAdministrativeBody[];
    notifyByEmail: boolean;
}

export interface SignupState {
    step: SignupStep;
    locations: Location[];
    topics: Topic[];
    /** The secondary bodies the reader ticked. Off by default: their meetings are not the municipality's. */
    bodies: PublicAdministrativeBody[];
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

/** The ticked bodies with `body` among them, once. */
export function withBody(bodies: PublicAdministrativeBody[], body: PublicAdministrativeBody | undefined): PublicAdministrativeBody[] {
    return !body || bodies.some(b => b.id === body.id) ? bodies : [...bodies, body];
}

export function initialSignupState(input: {
    initialStep: SignupStep;
    existing: ExistingPreference | null;
    account: SignupAccount | null;
    /**
     * Ticked from the start in a signup for bodies alone (#829): the bodies it
     * is about. A row that follows a body keeps its own choice instead.
     */
    preselectedBodies?: PublicAdministrativeBody[];
    /** The body whose page the reader came from: ticked on top of the rest. */
    requestedBody?: PublicAdministrativeBody;
}): SignupState {
    const { existing, account } = input;
    return {
        step: input.initialStep,
        locations: existing?.locations ?? [],
        topics: existing?.topics ?? [],
        bodies: withBody(
            existing?.bodies.length ? existing.bodies : input.preselectedBodies ?? existing?.bodies ?? [],
            input.requestedBody,
        ),
        // Notis has not been asked yet; the answer replaces this before the
        // card shows. Email starts off, as the design proposes it.
        phoneChannel: phoneChannelDefault(null, account),
        emailChannel: existing?.notifyByEmail ?? false,
        phone: account?.phone ?? '',
        name: account?.name ?? '',
        email: account?.email ?? '',
    };
}

/**
 * What the action of the preferences step does when the reader unticks every
 * body in a signup for bodies alone (#829). The action never deletes more than
 * follows:
 * - A new reader is blocked: a new row that follows no body receives nothing.
 * - A row with topics or places goes on: the save keeps them, with no body.
 * - A row that follows a body and holds nothing else stops following: the
 *   action deletes the row, through the delete of the profile, and the delete
 *   removes only the follows.
 * - A row that holds nothing at all is blocked, as a new reader is.
 */
export function preferencesAction(
    state: Pick<SignupState, 'bodies'>,
    scope: SignupScope,
    existing: Pick<ExistingPreference, 'bodies' | 'topics' | 'locations'> | null,
): 'continue' | 'blocked' | 'unfollow' {
    if (scope === 'city' || state.bodies.length > 0) return 'continue';
    if (!existing) return 'blocked';
    if (existing.topics.length > 0 || existing.locations.length > 0) return 'continue';
    return existing.bodies.length > 0 ? 'unfollow' : 'blocked';
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
    /**
     * Where the sign-in link lands when this email already has an account:
     * the page the reader is on. Validated server-side (safeRedirectPath).
     */
    returnTo?: string;

    locations: { text: string; coordinates: [number, number] }[];
    topicIds: string[];
    /** The secondary bodies the reader follows, always sent: an unticked body leaves. */
    bodyIds: string[];
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
    opts: { phoneChannelLocked?: boolean; returnTo?: string } = {},
): SignupSubmission {
    return {
        cityId,
        ...(opts.returnTo ? { returnTo: opts.returnTo } : {}),
        locations: state.locations.map(({ text, coordinates }) => ({ text, coordinates })),
        topicIds: state.topics.map((topic) => topic.id),
        bodyIds: state.bodies.map((body) => body.id),
        ...(opts.phoneChannelLocked ? {} : { notifyByPhone: state.phoneChannel }),
        notifyByEmail: state.emailChannel,
        ...(state.phoneChannel && state.phone ? { phone: state.phone } : {}),
        ...(signedIn ? {} : { name: state.name.trim(), email: state.email.trim() }),
    };
}
