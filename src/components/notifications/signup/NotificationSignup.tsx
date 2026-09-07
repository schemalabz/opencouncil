'use client';

import { useEffect, useRef, useState } from 'react';
import type { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { SignupFooter, SignupLayout, SignupProgress } from '@/components/signup/SignupChrome';
import { saveErrorKey } from '@/components/signup/signup-shared';
import { useSignupFlow } from '@/components/signup/useSignupFlow';
import { saveNotificationPreferences } from '@/lib/actions/notifications';
import { getNotisChannelState, setNotisEnabled } from '@/lib/actions/notis';
import { captureEvent } from '@/lib/analytics/capture';
import type { CityWithGeometry } from '@/lib/db/cities';
import { notisStatusFromChannelState } from '@/lib/notis/phone-channel';
import type { Location } from '@/lib/types/onboarding';
import { ChannelsStep } from './ChannelsStep';
import { CompleteAside, CompleteScreen } from './CompleteScreen';
import { IntroAside, IntroStep } from './IntroStep';
import { PreferencesAside, PreferencesStep } from './PreferencesStep';
import { SignupSummary } from './SignupSummary';
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
    topics,
    initialStep,
    existing,
    account,
}: {
    city: CityWithGeometry;
    topics: Topic[];
    initialStep: 1 | 2;
    existing: ExistingPreference | null;
    account: SignupAccount | null;
}) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');
    const signedIn = account !== null;
    const flow = useSignupFlow<SignupState>({
        initial: () => initialSignupState({ initialStep, existing, account }),
        cityId: city.id,
        signedIn,
        events: { stepViewed: 'notification_signup_step_viewed', failed: 'notification_signup_failed' },
    });
    const { state, patch, goTo, done, submitting, attempted, saveError, validity, setPhoneValidity } = flow;

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

    const submit = () =>
        flow.submit(async () => {
            if (notisPending) return 'blocked';
            if (channelIssues(state, validity).length > 0) return 'blocked';

            const result = await saveNotificationPreferences(
                buildSubmission(state, city.id, signedIn, { phoneChannelLocked: channelLocked }),
            );
            if (!result.success) {
                captureEvent('notification_signup_failed', { city_id: city.id, code: result.error });
                return { ok: false, error: saveErrorKey(result.error) };
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
            <PreferencesAside city={city} locations={state.locations} />
        ) : (
            <SignupSummary city={city} state={state} onEdit={() => goTo(2)} />
        );

    return (
        <SignupLayout aside={aside}>
            <SignupProgress step={state.step} total={TOTAL_STEPS} label={ts('stepOf', { step: state.step, total: TOTAL_STEPS })} />

            {state.step === 1 && <IntroStep city={city} existing={existing !== null} />}
            {state.step === 2 && (
                <PreferencesStep
                    city={city}
                    topics={topics}
                    locations={state.locations}
                    selectedTopics={state.topics}
                    onLocationsChange={(locations: Location[]) => patch({ locations })}
                    onTopicsChange={(selected: Topic[]) => patch({ topics: selected })}
                />
            )}
            {state.step === 3 && (
                <ChannelsStep
                    state={state}
                    signedIn={signedIn}
                    phoneChannelLocked={channelLocked}
                    phoneChannelPending={notisPending}
                    issues={issues}
                    saveError={saveError}
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
                    actionLabel={t('ctaContinue')}
                    onAction={() => goTo(3)}
                    backLabel={ts('back')}
                    onBack={() => goTo(1)}
                />
            )}
            {state.step === 3 && (
                <SignupFooter
                    actionLabel={submitting ? t('ctaSubmitting') : t('ctaSubmit')}
                    onAction={submit}
                    disabled={submitting || notisPending}
                    backLabel={ts('back')}
                    onBack={() => goTo(2)}
                />
            )}
        </SignupLayout>
    );
}
