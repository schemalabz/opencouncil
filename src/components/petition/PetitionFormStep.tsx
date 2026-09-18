'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField, type PhoneFieldValidity } from '@/components/ui/phone-field';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { CheckboxCard } from '@/components/ui/checkbox-card';
import { AccountFields } from '@/components/signup/AccountFields';
import { IssuesAlert, signInHrefFor } from '@/components/signup/IssuesAlert';
import { MemberNote } from '@/components/signup/MemberNote';
import { Eyebrow, StepHeading } from '@/components/signup/SignupChrome';
import type { SignupIssue } from '@/components/signup/signup-shared';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { PetitionBucket } from '@/lib/landing/petitions';
import { PetitionCityCard } from './PetitionCityCard';
import type { PetitionState } from './petition-state';

/**
 * Step 2: the reader's relation to the municipality — resident, registered
 * citizen, or their own words — as card checkboxes. A signed-out reader
 * also makes the account on the way, with an optional phone; for them the
 * step is about who is asking, so the heading says so.
 *
 * The card under the heading names the municipality, because the picker
 * links straight to this step and the copy here is the same for every one
 * of them.
 */
export function PetitionFormStep({
    city,
    bucket,
    pickerQuery,
    dirty,
    submitting,
    existing,
    state,
    signedIn,
    issues,
    saveError,
    failures,
    onChange,
    onPhoneValidity,
}: {
    city: CityWithGeometry;
    /** How many have asked already, for the card that names the municipality. */
    bucket: PetitionBucket | null;
    /** The search the picker row carried here, so «Αλλαγή» returns to that list. */
    pickerQuery: string;
    /** The reader has answered something that leaving would discard. */
    dirty: boolean;
    submitting: boolean;
    /** The reader already signed this petition, so this step updates it. */
    existing: boolean;
    state: PetitionState;
    signedIn: boolean;
    /** Shown once the reader has tried to submit. */
    issues: SignupIssue[];
    /** The save action's answer, as a key under `signup.errors`. */
    saveError: string | null;
    /** Failed presses of submit on this step; each one scrolls the alert into view. */
    failures: number;
    onChange: (patch: Partial<PetitionState>) => void;
    onPhoneValidity: (validity: PhoneFieldValidity) => void;
}) {
    const t = useTranslations('petition');
    const ts = useTranslations('signup');

    // Focus «Άλλο» when the reader ticks it, but never on the first render:
    // a returning reader whose stored relation is free text arrives with the
    // box already open, and `autoFocus` would scroll the heading and the
    // municipality above it off the top of a phone screen.
    const otherRef = useRef<HTMLInputElement>(null);
    const wasOther = useRef(state.other);
    useEffect(() => {
        if (state.other && !wasOther.current) otherRef.current?.focus({ preventScroll: true });
        wasOther.current = state.other;
    }, [state.other]);

    return (
        <div>
            {signedIn ? (
                <StepHeading title={t(authorityKey('relationTitle', city))} lead={t('relationHint')} />
            ) : (
                <StepHeading title={t('formTitle')} lead={t('formLead')} />
            )}

            <PetitionCityCard
                city={city}
                bucket={bucket}
                pickerQuery={pickerQuery}
                dirty={dirty}
                submitting={submitting}
                className="mt-5 lg:mt-7"
            />

            {existing && <MemberNote title={ts('picker.requested')} body={t('alreadyRequestedBody')} className="mt-3.5" />}

            <IssuesAlert saveError={saveError} issues={issues} failures={failures} signInHref={signInHrefFor(state.email)} />

            <section className="mt-5 flex flex-col gap-2.5">
                {!signedIn && (
                    <div className="flex items-baseline gap-2">
                        <Eyebrow>{t(authorityKey('relationEyebrow', city))}</Eyebrow>
                        <span className="text-xs text-muted-foreground">{t('relationHint')}</span>
                    </div>
                )}
                <div className="flex flex-col gap-3">
                    <CheckboxCard
                        checked={state.isResident}
                        onCheckedChange={(isResident) => onChange({ isResident })}
                        label={t('isResident')}
                        description={t(authorityKey('isResidentHint', city))}
                    />
                    <CheckboxCard
                        checked={state.isCitizen}
                        onCheckedChange={(isCitizen) => onChange({ isCitizen })}
                        label={t('isCitizen')}
                        description={t(authorityKey('isCitizenHint', city))}
                    />
                    <CheckboxCard
                        checked={state.other}
                        onCheckedChange={(other) => onChange({ other })}
                        label={t('isOther')}
                        description={t('isOtherHint')}
                    >
                        <Input
                            ref={otherRef}
                            type="text"
                            value={state.otherText}
                            onChange={(e) => onChange({ otherText: e.target.value })}
                            placeholder={t('otherPlaceholder')}
                            aria-label={t('isOther')}
                            maxLength={120}
                            className="h-11 text-base md:text-sm"
                        />
                    </CheckboxCard>
                </div>
            </section>

            {!signedIn && (
                <AccountFields name={state.name} email={state.email} hint={t('accountHint')} onChange={onChange}>
                    <div className="mt-3.5 flex flex-col gap-1.5">
                        <Label htmlFor="signup-phone" className="text-[13px] font-medium">
                            {ts('phone.label')} <span className="font-normal text-muted-foreground">· {t('phoneHint')}</span>
                        </Label>
                        <PhoneField
                            id="signup-phone"
                            value={state.phone}
                            onChange={(phone) => onChange({ phone })}
                            onValidityChange={onPhoneValidity}
                            placeholder={ts('phone.placeholder')}
                            activePlaceholder={ts('phone.placeholder')}
                            invalidMessage={ts('errors.phoneInvalid')}
                            notMobileMessage={ts('errors.phoneNotMobile')}
                        />
                    </div>
                </AccountFields>
            )}

            <p className="mt-4 text-[11px] leading-[1.45] text-muted-foreground">
                {t('consent')}{' '}
                <Link href="/privacy" className="text-muted-foreground underline">
                    {ts('privacy')}
                </Link>
            </p>
        </div>
    );
}
