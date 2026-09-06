'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField, type PhoneFieldValidity } from '@/components/ui/phone-field';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { AccountFields } from '@/components/signup/AccountFields';
import { CardCheckbox } from '@/components/signup/CardCheckbox';
import { IssuesAlert, signInHrefFor } from '@/components/signup/IssuesAlert';
import { Eyebrow, StepHeading } from '@/components/signup/SignupChrome';
import type { SignupIssue } from '@/components/signup/signup-shared';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { PetitionState } from './petition-state';

/**
 * Step 2: the reader's relation to the municipality — resident, registered
 * citizen, or their own words — as card checkboxes. A signed-out reader
 * also makes the account on the way, with an optional phone; for them the
 * step is about who is asking, so the heading says so.
 */
export function PetitionFormStep({
    city,
    state,
    signedIn,
    issues,
    saveError,
    onChange,
    onPhoneValidity,
}: {
    city: CityWithGeometry;
    state: PetitionState;
    signedIn: boolean;
    /** Shown once the reader has tried to submit. */
    issues: SignupIssue[];
    /** The save action's answer, as a key under `signup.errors`. */
    saveError: string | null;
    onChange: (patch: Partial<PetitionState>) => void;
    onPhoneValidity: (validity: PhoneFieldValidity) => void;
}) {
    const t = useTranslations('petition');
    const ts = useTranslations('signup');

    return (
        <div>
            {signedIn ? (
                <StepHeading title={t(authorityKey('relationTitle', city))} lead={t('relationHint')} />
            ) : (
                <StepHeading title={t('formTitle')} lead={t('formLead')} />
            )}

            <IssuesAlert saveError={saveError} issues={issues} signInHref={signInHrefFor(state.email)} />

            <section className="mt-5 flex flex-col gap-2.5">
                {!signedIn && (
                    <div className="flex items-baseline gap-2">
                        <Eyebrow>{t(authorityKey('relationEyebrow', city))}</Eyebrow>
                        <span className="text-xs text-muted-foreground">{t('relationHint')}</span>
                    </div>
                )}
                <div className="flex flex-col gap-3">
                    <CardCheckbox
                        checked={state.isResident}
                        onToggle={() => onChange({ isResident: !state.isResident })}
                        title={t('isResident')}
                        description={t(authorityKey('isResidentHint', city))}
                    />
                    <CardCheckbox
                        checked={state.isCitizen}
                        onToggle={() => onChange({ isCitizen: !state.isCitizen })}
                        title={t('isCitizen')}
                        description={t(authorityKey('isCitizenHint', city))}
                    />
                    <CardCheckbox
                        checked={state.other}
                        onToggle={() => onChange({ other: !state.other })}
                        title={t('isOther')}
                        description={t('isOtherHint')}
                    >
                        <Input
                            type="text"
                            value={state.otherText}
                            onChange={(e) => onChange({ otherText: e.target.value })}
                            placeholder={t('otherPlaceholder')}
                            aria-label={t('isOther')}
                            maxLength={120}
                            autoFocus
                            className="h-11 text-base md:text-sm"
                        />
                    </CardCheckbox>
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
