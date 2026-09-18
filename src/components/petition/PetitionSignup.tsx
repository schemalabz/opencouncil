'use client';

import { useTranslations } from 'next-intl';
import { LocationPreview } from '@/components/signup/LocationPreview';
import { SignupFooter, SignupLayout, SignupProgress } from '@/components/signup/SignupChrome';
import { draftKey } from '@/components/signup/signup-draft';
import { SIGN_IN_LINK_SENT, failureKind, saveErrorKey, type SignupAccount } from '@/components/signup/signup-shared';
import { useSignupFlow } from '@/components/signup/useSignupFlow';
import { savePetition } from '@/lib/actions/notifications';
import { captureEvent } from '@/lib/analytics/capture';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { PetitionBucket } from '@/lib/landing/petitions';
import { PetitionComplete, PetitionCompleteAside } from './PetitionComplete';
import { PetitionFormStep } from './PetitionFormStep';
import { PetitionIntroStep } from './PetitionIntroStep';
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
 * What a kept draft may put back. The step comes from the URL; the account
 * fields belong to the session once there is one.
 */
function petitionDraft(cityId: string, signedIn: boolean) {
    return {
        key: draftKey('petition', cityId),
        apply: (state: PetitionState, stored: Partial<PetitionState>): PetitionState => ({
            ...state,
            isResident: stored.isResident ?? state.isResident,
            isCitizen: stored.isCitizen ?? state.isCitizen,
            other: stored.other ?? state.other,
            otherText: stored.otherText ?? state.otherText,
            ...(signedIn
                ? {}
                : {
                      name: stored.name ?? state.name,
                      email: stored.email ?? state.email,
                      phone: stored.phone ?? state.phone,
                  }),
        }),
    };
}


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
    pickerQuery,
    existing,
    account,
}: {
    city: CityWithGeometry;
    bucket: PetitionBucket | null;
    initialStep: PetitionStep;
    /** The search the picker row carried here, so «Αλλαγή» returns to that list. */
    pickerQuery: string;
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
        // Nothing is kept for a reader who is updating a petition they
        // already signed: the server's answers are the truth.
        draft: existing ? undefined : petitionDraft(city.id, signedIn),
    });
    const { state, patch, goTo, edited, done, submitting, attempted, failures, saveError, validity, phoneValidity, setPhoneValidity } =
        flow;

    const issues = attempted ? petitionIssues(state, validity) : [];
    const failure = failureKind(issues, saveError);

    const submit = () =>
        flow.submit(async () => {
            if (petitionIssues(state, validity).length > 0) return 'blocked';

            const result = await savePetition(
                buildPetitionSubmission(
                    state,
                    city.id,
                    signedIn,
                    phoneValidity.isEmpty,
                    // Where the sign-in link lands if this email already has
                    // an account: right back here, with the draft in place.
                    window.location.pathname + window.location.search,
                ),
            );
            if (!result.success) {
                const key = saveErrorKey(result.error);
                // See NotificationSignup: the link-sent answer gets its own
                // event so the failure count keeps meaning failures.
                captureEvent(key === SIGN_IN_LINK_SENT ? 'petition_link_sent' : 'petition_failed', {
                    city_id: city.id,
                    code: result.error,
                });
                return { ok: false, error: key };
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

    // The desktop's second column: the place the reader is asking for.
    const aside = <LocationPreview city={city} locations={[]} variant="panel" />;

    return (
        <SignupLayout aside={aside}>
            <SignupProgress step={state.step} total={TOTAL_STEPS} label={ts('stepOf', { step: state.step, total: TOTAL_STEPS })} />

            {state.step === 1 && (
                <PetitionIntroStep
                    city={city}
                    bucket={bucket}
                    pickerQuery={pickerQuery}
                    dirty={edited}
                    existing={existing !== null}
                />
            )}
            {state.step === 2 && (
                <PetitionFormStep
                    city={city}
                    bucket={bucket}
                    pickerQuery={pickerQuery}
                    dirty={edited}
                    submitting={submitting}
                    existing={existing !== null}
                    state={state}
                    signedIn={signedIn}
                    issues={issues}
                    saveError={saveError}
                    failures={failures}
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
                    failure={failure}
                    failures={failures}
                    backLabel={ts('back')}
                    onBack={() => goTo(1)}
                />
            )}
        </SignupLayout>
    );
}
