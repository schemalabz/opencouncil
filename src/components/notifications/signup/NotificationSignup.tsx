'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import type { PhoneFieldValidity } from '@/components/ui/phone-field';
import { SignupFooter, SignupLayout, SignupProgress } from '@/components/signup/SignupChrome';
import { saveErrorKey } from '@/components/signup/signup-shared';
import { saveNotificationPreferences } from '@/lib/actions/notifications';
import { setNotisEnabled } from '@/lib/actions/notis';
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
    type SignupStep,
    buildSubmission,
    channelIssues,
    initialSignupState,
} from './signup-state';
import type { SignupIssue } from '@/components/signup/signup-shared';

const TOTAL_STEPS = 3;

const INITIAL_VALIDITY: PhoneFieldValidity = { isActive: false, isEmpty: true, isValid: false, reason: null };

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
    const [state, setState] = useState<SignupState>(() =>
        initialSignupState({ initialStep, existing, account, notisStatus }),
    );
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [phoneValidity, setPhoneValidity] = useState<PhoneFieldValidity>(INITIAL_VALIDITY);
    const viewed = useRef<Set<number>>(new Set());

    const patch = useCallback((next: Partial<SignupState>) => setState((s) => ({ ...s, ...next })), []);

    useEffect(() => {
        if (done || viewed.current.has(state.step)) return;
        viewed.current.add(state.step);
        captureEvent('notification_signup_step_viewed', { city_id: city.id, step: state.step, signed_in: signedIn });
    }, [city.id, done, signedIn, state.step]);

    const goTo = useCallback((step: SignupStep) => {
        setState((s) => ({ ...s, step }));
        const url = new URL(window.location.href);
        url.searchParams.set('step', String(step));
        window.history.replaceState(window.history.state, '', url);
        window.scrollTo({ top: 0 });
    }, []);

    const issues: SignupIssue[] = attempted
        ? channelIssues(state, {
              phoneEmpty: phoneValidity.isEmpty,
              phoneValid: phoneValidity.isValid,
              signedIn,
          })
        : [];

    const submit = async () => {
        setAttempted(true);
        setSaveError(null);
        const blocking = channelIssues(state, {
            phoneEmpty: phoneValidity.isEmpty,
            phoneValid: phoneValidity.isValid,
            signedIn,
        });
        if (blocking.length > 0) return;

        setSubmitting(true);
        try {
            const result = await saveNotificationPreferences(buildSubmission(state, city.id, signedIn));
            if (!result.success) {
                const key = saveErrorKey(result.error);
                setSaveError(key);
                captureEvent('notification_signup_failed', { city_id: city.id, code: result.error });
                return;
            }
            // A reader who had said ΣΤΟΠ and ticked WhatsApp again did so on
            // purpose: that is the explicit action re-activation waits for.
            // The poller never resurrects a subscription on its own.
            if (signedIn && state.phoneChannel && notisStatus === 'unsubscribed') {
                await setNotisEnabled(true);
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
            setDone(true);
            window.scrollTo({ top: 0 });
        } catch (error) {
            console.error('Notification signup failed:', error);
            setSaveError('generic');
            captureEvent('notification_signup_failed', { city_id: city.id, code: 'exception' });
        } finally {
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <SignupLayout aside={<CompleteAside city={city} signedIn={signedIn} />}>
                <CompleteScreen
                    city={city}
                    locations={state.locations}
                    phone={state.phone}
                    email={state.email}
                    phoneChannel={state.phoneChannel}
                    known={signedIn && notisStatus !== null}
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
