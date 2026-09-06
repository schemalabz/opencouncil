'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PhoneFieldValidity } from '@/components/ui/phone-field';
import { LocationPreview } from '@/components/signup/LocationPreview';
import { SignupFooter, SignupLayout, SignupProgress } from '@/components/signup/SignupChrome';
import { saveErrorKey, type SignupAccount, type SignupIssue } from '@/components/signup/signup-shared';
import { savePetition } from '@/lib/actions/notifications';
import { captureEvent } from '@/lib/analytics/capture';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { PetitionBucket } from '@/lib/landing/petitions';
import { PetitionComplete, PetitionCompleteAside } from './PetitionComplete';
import { PetitionFormStep } from './PetitionFormStep';
import { PetitionIntroAside, PetitionIntroStep } from './PetitionIntroStep';
import {
    type ExistingPetition,
    type PetitionState,
    type PetitionStep,
    buildPetitionSubmission,
    initialPetitionState,
    petitionIssues,
} from './petition-state';

const TOTAL_STEPS = 2;

const INITIAL_VALIDITY: PhoneFieldValidity = { isActive: false, isEmpty: true, isValid: false, reason: null };

/**
 * The petition for one municipality: step 1 explains, step 2 asks who is
 * asking. Built on the notification signup's chrome and rules, so the two
 * flows look and behave the same; `?step=2` is where the municipality
 * picker on /petition lands.
 */
export function PetitionSignup({
    city,
    bucket,
    initialStep,
    existing,
    account,
}: {
    city: CityWithGeometry;
    bucket: PetitionBucket | null;
    initialStep: PetitionStep;
    existing: ExistingPetition | null;
    account: SignupAccount | null;
}) {
    const t = useTranslations('petition');
    const ts = useTranslations('signup');
    const signedIn = account !== null;
    const [state, setState] = useState<PetitionState>(() => initialPetitionState({ initialStep, existing, account }));
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [phoneValidity, setPhoneValidity] = useState<PhoneFieldValidity>(INITIAL_VALIDITY);
    const viewed = useRef<Set<number>>(new Set());

    const patch = useCallback((next: Partial<PetitionState>) => setState((s) => ({ ...s, ...next })), []);

    useEffect(() => {
        if (done || viewed.current.has(state.step)) return;
        viewed.current.add(state.step);
        captureEvent('petition_step_viewed', { city_id: city.id, step: state.step, signed_in: signedIn });
    }, [city.id, done, signedIn, state.step]);

    const goTo = useCallback((step: PetitionStep) => {
        setState((s) => ({ ...s, step }));
        const url = new URL(window.location.href);
        url.searchParams.set('step', String(step));
        window.history.replaceState(window.history.state, '', url);
        window.scrollTo({ top: 0 });
    }, []);

    const validity = { phoneEmpty: phoneValidity.isEmpty, phoneValid: phoneValidity.isValid, signedIn };
    const issues: SignupIssue[] = attempted ? petitionIssues(state, validity) : [];

    const submit = async () => {
        setAttempted(true);
        setSaveError(null);
        if (petitionIssues(state, validity).length > 0) return;

        setSubmitting(true);
        try {
            const result = await savePetition(buildPetitionSubmission(state, city.id, signedIn, phoneValidity.isEmpty));
            if (!result.success) {
                setSaveError(saveErrorKey(result.error));
                captureEvent('petition_failed', { city_id: city.id, code: result.error });
                return;
            }
            captureEvent('petition_submitted', {
                city_id: city.id,
                is_resident: state.isResident,
                is_citizen: state.isCitizen,
                has_other: state.other,
                has_phone: signedIn ? Boolean(account.phone) : !phoneValidity.isEmpty,
                signed_in: signedIn,
                updated: existing !== null,
            });
            setDone(true);
            window.scrollTo({ top: 0 });
        } catch (error) {
            console.error('Petition failed:', error);
            setSaveError('generic');
            captureEvent('petition_failed', { city_id: city.id, code: 'exception' });
        } finally {
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <SignupLayout aside={<PetitionCompleteAside />}>
                <PetitionComplete city={city} updated={existing !== null} signedIn={signedIn} />
            </SignupLayout>
        );
    }

    // The desktop's second column: what the reader is asking for, then the place they are asking it for.
    const aside = state.step === 1 ? <PetitionIntroAside /> : <LocationPreview city={city} locations={[]} variant="panel" />;

    return (
        <SignupLayout aside={aside}>
            <SignupProgress step={state.step} total={TOTAL_STEPS} label={ts('stepOf', { step: state.step, total: TOTAL_STEPS })} />

            {state.step === 1 && <PetitionIntroStep city={city} bucket={bucket} existing={existing !== null} />}
            {state.step === 2 && (
                <PetitionFormStep
                    city={city}
                    state={state}
                    signedIn={signedIn}
                    issues={issues}
                    saveError={saveError}
                    onChange={patch}
                    onPhoneValidity={setPhoneValidity}
                />
            )}

            {state.step === 1 && (
                <SignupFooter actionLabel={existing ? t('ctaUpdate') : t('ctaStart')} onAction={() => goTo(2)} />
            )}
            {state.step === 2 && (
                <SignupFooter
                    actionLabel={submitting ? t('ctaSubmitting') : t('ctaSubmit')}
                    onAction={submit}
                    disabled={submitting}
                    backLabel={ts('back')}
                    onBack={() => goTo(1)}
                />
            )}
        </SignupLayout>
    );
}
