'use client';

import { useTranslations } from 'next-intl';
import { LocationPreview } from '@/components/signup/LocationPreview';
import { SignupFooter, SignupLayout, SignupProgress } from '@/components/signup/SignupChrome';
import { saveErrorKey, type SignupAccount } from '@/components/signup/signup-shared';
import { useSignupFlow } from '@/components/signup/useSignupFlow';
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
    const flow = useSignupFlow<PetitionState>({
        initial: () => initialPetitionState({ initialStep, existing, account }),
        cityId: city.id,
        signedIn,
        events: { stepViewed: 'petition_step_viewed', failed: 'petition_failed' },
    });
    const { state, patch, goTo, done, submitting, attempted, saveError, validity, phoneValidity, setPhoneValidity } = flow;

    const issues = attempted ? petitionIssues(state, validity) : [];

    const submit = () =>
        flow.submit(async () => {
            if (petitionIssues(state, validity).length > 0) return 'blocked';

            const result = await savePetition(buildPetitionSubmission(state, city.id, signedIn, phoneValidity.isEmpty));
            if (!result.success) {
                captureEvent('petition_failed', { city_id: city.id, code: result.error });
                return { ok: false, error: saveErrorKey(result.error) };
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
            return { ok: true };
        });

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
