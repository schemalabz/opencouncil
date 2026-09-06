'use client';

import { useState } from 'react';
import type { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { SignupFooter, SignupLayout, SignupProgress } from '@/components/signup/SignupChrome';
import { saveErrorKey } from '@/components/signup/signup-shared';
import { useSignupFlow } from '@/components/signup/useSignupFlow';
import { saveNotificationPreferences } from '@/lib/actions/notifications';
import { releaseNotisWithoutPhoneChannel, setNotisEnabled } from '@/lib/actions/notis';
import { captureEvent } from '@/lib/analytics/capture';
import type { CityWithGeometry } from '@/lib/db/cities';
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
} from './signup-state';

const TOTAL_STEPS = 3;

/**
 * The three steps and the completion screen, on one page. The step rides in
 * the URL (`?step=2` is where the municipality picker lands), so a reload
 * keeps the place; the choices live in memory, so a reload starts them
 * over — a signed-in reader's saved preferences come back from the server.
 */
export function NotificationSignup({
    city,
    topics,
    initialStep,
    existing,
    account,
    notisStatus,
}: {
    city: CityWithGeometry;
    topics: Topic[];
    initialStep: 1 | 2;
    existing: ExistingPreference | null;
    account: SignupAccount | null;
    notisStatus: NotisStatus;
}) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');
    const signedIn = account !== null;
    const flow = useSignupFlow<SignupState>({
        initial: () => initialSignupState({ initialStep, existing, account, notisStatus }),
        cityId: city.id,
        signedIn,
        events: { stepViewed: 'notification_signup_step_viewed', failed: 'notification_signup_failed' },
    });
    const { state, patch, goTo, done, submitting, attempted, saveError, validity, setPhoneValidity } = flow;
    // Whether Notis serves this reader once the signup is done: the completion
    // screen promises an intro only to a reader he does not know yet.
    const [known, setKnown] = useState(notisStatus === 'active');

    const issues = attempted ? channelIssues(state, validity) : [];

    const submit = () =>
        flow.submit(async () => {
            if (channelIssues(state, validity).length > 0) return 'blocked';

            const result = await saveNotificationPreferences(buildSubmission(state, city.id, signedIn));
            if (!result.success) {
                captureEvent('notification_signup_failed', { city_id: city.id, code: result.error });
                return { ok: false, error: saveErrorKey(result.error) };
            }

            // The flags are written; now the side Notis owns. A refusal or a
            // silence must not pass as success: the flags would then claim a
            // channel that does not exist, and the poller never resurrects a
            // subscription on its own.
            const action = notisActionFor(state, signedIn, notisStatus);
            if (action === 'activate') {
                const notis = await setNotisEnabled(true);
                if (!notis.ok) {
                    captureEvent('notification_signup_failed', { city_id: city.id, code: notis.code });
                    return { ok: false, error: saveErrorKey(notis.code) };
                }
                if (!notis.synced) {
                    captureEvent('notification_signup_failed', { city_id: city.id, code: 'notis_unreachable' });
                    return { ok: false, error: 'notisUnreachable' };
                }
                setKnown(notis.subscription?.status === 'active');
            } else if (action === 'release') {
                // Best effort: the flags already mute the proactive audience, and
                // the poller reconciles a subscription left behind.
                await releaseNotisWithoutPhoneChannel();
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
                    issues={issues}
                    saveError={saveError}
                    onChange={patch}
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
                    disabled={submitting}
                    backLabel={ts('back')}
                    onBack={() => goTo(2)}
                />
            )}
        </SignupLayout>
    );
}
