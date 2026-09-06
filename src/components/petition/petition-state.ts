import { accountIssues, type SignupAccount, type SignupIssue } from '@/components/signup/signup-shared';

/**
 * The petition's state and rules, kept apart from React like the signup's:
 * what the two steps start from, when the form may submit, and what the
 * save action receives.
 */

export type PetitionStep = 1 | 2;

/** A petition this reader already signed for the municipality. */
export interface ExistingPetition {
    isResident: boolean;
    isCitizen: boolean;
    otherRelation: string | null;
}

export interface PetitionState {
    step: PetitionStep;
    isResident: boolean;
    isCitizen: boolean;
    /** The third relation, in the reader's words, ticked and typed. */
    other: boolean;
    otherText: string;
    name: string;
    email: string;
    phone: string;
}

export function initialPetitionState(input: {
    initialStep: PetitionStep;
    existing: ExistingPetition | null;
    account: SignupAccount | null;
}): PetitionState {
    return {
        step: input.initialStep,
        isResident: input.existing?.isResident ?? false,
        isCitizen: input.existing?.isCitizen ?? false,
        other: Boolean(input.existing?.otherRelation),
        otherText: input.existing?.otherRelation ?? '',
        name: input.account?.name ?? '',
        email: input.account?.email ?? '',
        phone: '',
    };
}

/**
 * What stops the form from submitting, in display order. The phone is
 * optional here, so only a number that is there and wrong is an issue.
 */
export function petitionIssues(
    state: PetitionState,
    opts: { phoneEmpty: boolean; phoneValid: boolean; signedIn: boolean },
): SignupIssue[] {
    const issues: SignupIssue[] = [];
    if (!state.isResident && !state.isCitizen && !state.other) issues.push('relation_missing');
    if (state.other && !state.otherText.trim()) issues.push('other_relation_missing');
    if (!opts.signedIn) {
        issues.push(...accountIssues(state));
        if (!opts.phoneEmpty && !opts.phoneValid) issues.push('phone_invalid');
    }
    return issues;
}

export interface PetitionSubmission {
    cityId: string;
    isResident: boolean;
    isCitizen: boolean;
    otherRelation: string | null;
    name?: string;
    email?: string;
    phone?: string;
}

/**
 * What the save action receives. An unticked «Άλλο» sends null, so an
 * earlier answer is cleared. A signed-in reader's name, email and phone are
 * the account's; a signed-out reader's phone goes only when they typed one,
 * because the field carries the dial code even while empty.
 */
export function buildPetitionSubmission(
    state: PetitionState,
    cityId: string,
    signedIn: boolean,
    phoneEmpty: boolean,
): PetitionSubmission {
    return {
        cityId,
        isResident: state.isResident,
        isCitizen: state.isCitizen,
        otherRelation: state.other ? state.otherText.trim() : null,
        ...(signedIn
            ? {}
            : {
                  name: state.name.trim(),
                  email: state.email.trim(),
                  ...(phoneEmpty ? {} : { phone: state.phone }),
              }),
    };
}
