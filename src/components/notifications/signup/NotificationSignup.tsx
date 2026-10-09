'use client';

import { useEffect, useRef, useState } from 'react';
import type { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { SignupFooter, SignupLayout, SignupProgress } from '@/components/signup/SignupChrome';
import { SIGN_IN_LINK_SENT, failureKind, saveErrorKey } from '@/components/signup/signup-shared';
import { useSignupFlow } from '@/components/signup/useSignupFlow';
import { saveNotificationPreferences } from '@/lib/actions/notifications';
import { getNotisChannelState, setNotisEnabled } from '@/lib/actions/notis';
import { captureEvent } from '@/lib/analytics/capture';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { notisStatusFromChannelState } from '@/lib/notis/phone-channel';
import type { Location } from '@/lib/types/onboarding';
import { ChannelsStep } from './ChannelsStep';
import { CompleteAside, CompleteScreen } from './CompleteScreen';
import { IntroAside, IntroStep } from './IntroStep';
import { PreferencesAside, PreferencesStep } from './PreferencesStep';
import { SignupSummary } from './SignupSummary';
import { useNearbySubjects } from './useNearbySubjects';
import {
    type ExistingPreference,
    type NotisStatus,
    type SignupAccount,
    type SignupState,
    buildSubmission,
    channelIssues,
    initialSignupState,
    notisActionFor,
    phoneChannelDefault,
    phoneChannelLocked,
} from './signup-state';

const TOTAL_STEPS = 3;

/**
 * What a kept draft may put back of this flow's own fields. The step comes
 * from the URL, not the draft, and the account fields are the hook's rule
 * (see useSignupFlow). The WhatsApp tick is Notis's answer and is never
 * restored — a stale tick over his could resubscribe a reader who said ΣΤΟΠ.
 */
function applyNotificationsDraft(state: SignupState, stored: Partial<SignupState>): SignupState {
    return {
        ...state,
        locations: stored.locations ?? state.locations,
        topics: stored.topics ?? state.topics,
        bodies: stored.bodies ?? state.bodies,
        emailChannel: stored.emailChannel ?? state.emailChannel,
    };
}


/**
 * The three steps and the completion screen, on one page. The step rides in
 * the URL (`?step=2` is where the municipality picker lands), so a reload
 * keeps the place; the choices live in memory, so a reload starts them
 * over — a signed-in reader's saved preferences come back from the server.
 *
 * Notis is asked about a signed-in reader in the background, not before
 * the page shows: the answer only matters at step 3, where the WhatsApp
 * card starts from it. A reader who reaches step 3 before it arrives waits
 * there, briefly, rather than see the card flip under their thumb.
 */
export function NotificationSignup({
    city,
    scope,
    topics,
    secondaryBodies,
    initialStep,
    pickerQuery,
    existing,
    account,
    googleAvailable,
}: {
    city: CityWithGeometry;
    /**
     * What the signup is about (#829). `city`: the municipality's own
     * meetings, with the secondary bodies behind a tick. `bodies`: the
     * secondary bodies alone, in a municipality that does not support
     * notifications; the intro, the places and the topics are left out, and
     * the bodies start ticked.
     */
    scope: 'city' | 'bodies';
    topics: Topic[];
    /** The secondary bodies of the municipality a reader may follow (#829). */
    secondaryBodies: PublicAdministrativeBody[];
    initialStep: 1 | 2;
    /** The search the picker row carried here, so «Αλλαγή» returns to that list. */
    pickerQuery: string;
    existing: ExistingPreference | null;
    account: SignupAccount | null;
    /** Whether the account fields offer "Continue with Google" (see googleSignInAvailable). */
    googleAvailable: boolean;
}) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');
    const signedIn = account !== null;
    const bodiesOnly = scope === 'bodies';
    // A signup for bodies alone has no intro step: its progress counts from the preferences.
    const stepOffset = bodiesOnly ? 1 : 0;
    const flow = useSignupFlow<SignupState>({
        initial: () => initialSignupState({
            initialStep: bodiesOnly ? 2 : initialStep,
            existing,
            account,
            preselectedBodies: bodiesOnly ? secondaryBodies : undefined,
        }),
        cityId: city.id,
        signedIn,
        events: { stepViewed: 'notification_signup_step_viewed', failed: 'notification_signup_failed' },
        // Nothing is kept for a reader who is editing what they already
        // saved: the server's answers are the truth, and a draft from an
        // abandoned session would put yesterday's places over them.
        draft: existing ? undefined : { flow: 'notifications', account, apply: applyNotificationsDraft },
    });
    const { state, patch, goTo, edited, done, submitting, attempted, failures, saveError, validity, setPhoneValidity } = flow;

    // 'pending' until Notis has answered for a signed-in reader; a signed-out
    // reader has nothing to ask about.
    const [notisStatus, setNotisStatus] = useState<NotisStatus | 'pending'>(signedIn ? 'pending' : null);
    // Once the reader has touched the card, Notis's late answer keeps its hands off it.
    const touchedPhoneChannel = useRef(false);
    useEffect(() => {
        if (!signedIn) return;
        let cancelled = false;
        getNotisChannelState()
            .then((channel) => (channel ? notisStatusFromChannelState(channel) : null))
            .catch((error: unknown) => {
                console.error('Notis status failed:', error);
                return 'unknown' as const;
            })
            .then((status) => {
                if (cancelled) return;
                setNotisStatus(status);
                if (!touchedPhoneChannel.current) patch({ phoneChannel: phoneChannelDefault(status, account) });
            });
        return () => {
            cancelled = true;
        };
    }, [account, patch, signedIn]);

    // Whether Notis serves this reader once the signup is done: the completion
    // screen promises an intro only to a reader he does not know yet.
    const [known, setKnown] = useState(false);
    useEffect(() => {
        if (notisStatus === 'active') setKnown(true);
    }, [notisStatus]);

    const notisPending = notisStatus === 'pending';
    // The card is not the reader's to change until Notis has answered, and a
    // silent Notis stays that way: the rest of the step still saves.
    const channelLocked = notisPending || phoneChannelLocked(notisStatus);
    const issues = attempted ? channelIssues(state, validity) : [];
    const failure = failureKind(issues, saveError);

    // One request for the step and its aside, about the place added last.
    const latestPlace = state.locations.length > 0 ? state.locations[state.locations.length - 1] : null;
    const nearby = useNearbySubjects(city.id, state.step === 2 ? latestPlace : null);

    const submit = () =>
        flow.submit(async () => {
            if (notisPending) return 'blocked';
            if (channelIssues(state, validity).length > 0) return 'blocked';

            const result = await saveNotificationPreferences(
                buildSubmission(state, city.id, signedIn, {
                    phoneChannelLocked: channelLocked,
                    // Where the sign-in link lands if this email already has
                    // an account: right back here, with the draft in place.
                    returnTo: window.location.pathname + window.location.search,
                }),
            );
            if (!result.success) {
                const key = saveErrorKey(result.error);
                // The sign-in link went out: a step on the way, not a
                // failure, and counting it as one would hide whether this
                // whole detour is getting shorter.
                captureEvent(
                    key === SIGN_IN_LINK_SENT ? 'notification_signup_link_sent' : 'notification_signup_failed',
                    { city_id: city.id, code: result.error },
                );
                return { ok: false, error: key };
            }

            // The request is written; now the side Notis owns. A refusal or a
            // silence must not pass as success: the request would then claim a
            // channel that does not exist, and the poller never resurrects a
            // subscription on its own.
            const action = notisActionFor(state, signedIn, notisStatus);
            if (action !== null) {
                const notis = await setNotisEnabled(action === 'activate');
                if (!notis.ok) {
                    captureEvent('notification_signup_failed', { city_id: city.id, code: notis.code });
                    return { ok: false, error: saveErrorKey(notis.code) };
                }
                setKnown(notis.subscription?.status === 'active');
            }

            captureEvent('notification_signup_completed', {
                city_id: city.id,
                location_count: state.locations.length,
                topic_count: state.topics.length,
                body_count: state.bodies.length,
                has_phone: Boolean(state.phone),
                notify_by_phone: state.phoneChannel,
                notify_by_email: state.emailChannel,
                signed_in: signedIn,
            });
            return { ok: true };
        });

    if (done) {
        return (
            <SignupLayout aside={<CompleteAside city={city} signedIn={signedIn} />}>
                <CompleteScreen
                    city={city}
                    locations={state.locations}
                    phone={state.phone}
                    email={state.email}
                    phoneChannel={state.phoneChannel}
                    known={known}
                    signedIn={signedIn}
                />
            </SignupLayout>
        );
    }

    // The desktop's second column: what the step is about, beside the step.
    const aside =
        state.step === 1 ? (
            <IntroAside city={city} />
        ) : state.step === 2 ? (
            bodiesOnly ? null : <PreferencesAside city={city} locations={state.locations} nearby={nearby} />
        ) : (
            <SignupSummary city={city} scope={scope} state={state} onEdit={() => goTo(2)} />
        );

    return (
        <SignupLayout aside={aside}>
            <SignupProgress
                step={state.step - stepOffset}
                total={TOTAL_STEPS - stepOffset}
                label={ts('stepOf', { step: state.step - stepOffset, total: TOTAL_STEPS - stepOffset })}
            />

            {state.step === 1 && (
                <IntroStep city={city} pickerQuery={pickerQuery} dirty={edited} existing={existing !== null} />
            )}
            {state.step === 2 && (
                <PreferencesStep
                    city={city}
                    scope={scope}
                    pickerQuery={pickerQuery}
                    dirty={edited}
                    existing={existing !== null}
                    topics={topics}
                    bodies={secondaryBodies}
                    locations={state.locations}
                    selectedTopics={state.topics}
                    selectedBodies={state.bodies}
                    nearby={nearby}
                    onLocationsChange={(locations: Location[]) => patch({ locations })}
                    onTopicsChange={(selected: Topic[]) => patch({ topics: selected })}
                    onBodiesChange={(selected: PublicAdministrativeBody[]) => patch({ bodies: selected })}
                />
            )}
            {state.step === 3 && (
                <ChannelsStep
                    city={city}
                    pickerQuery={pickerQuery}
                    dirty={edited}
                    submitting={submitting}
                    state={state}
                    signedIn={signedIn}
                    googleAvailable={googleAvailable}
                    onGoogleStart={() => {
                        flow.stashPhoneForGoogle();
                        captureEvent('notification_signup_google_started', { city_id: city.id });
                    }}
                    phoneChannelLocked={channelLocked}
                    phoneChannelPending={notisPending}
                    issues={issues}
                    saveError={saveError}
                    failures={failures}
                    onChange={(next) => {
                        if (next.phoneChannel !== undefined) touchedPhoneChannel.current = true;
                        patch(next);
                    }}
                    onPhoneValidity={setPhoneValidity}
                />
            )}

            {state.step === 1 && <SignupFooter actionLabel={t('ctaStart')} onAction={() => goTo(2)} />}
            {state.step === 2 && (
                <SignupFooter
                    // The label says what pressing it means: skipping the places is allowed, but it is a choice.
                    actionLabel={bodiesOnly || state.locations.length > 0 ? t('ctaContinue') : t('ctaContinueWithoutPlace')}
                    onAction={() => {
                        captureEvent('notification_signup_preferences_continued', {
                            city_id: city.id,
                            location_count: state.locations.length,
                            topic_count: state.topics.length,
                            body_count: state.bodies.length,
                        });
                        goTo(3);
                    }}
                    // There is no intro step to go back to in a signup for bodies alone.
                    {...(!bodiesOnly && { backLabel: ts('back'), onBack: () => goTo(1) })}
                />
            )}
            {state.step === 3 && (
                <SignupFooter
                    actionLabel={submitting ? t('ctaSubmitting') : t('ctaSubmit')}
                    onAction={submit}
                    disabled={submitting || notisPending}
                    failure={failure}
                    failures={failures}
                    backLabel={ts('back')}
                    onBack={() => goTo(2)}
                />
            )}
        </SignupLayout>
    );
}
