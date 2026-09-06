'use client';

import Image from 'next/image';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { CheckboxCard } from '@/components/ui/checkbox-card';
import { Label } from '@/components/ui/label';
import { PhoneField, type PhoneFieldValidity } from '@/components/ui/phone-field';
import { AccountFields } from '@/components/signup/AccountFields';
import { IssuesAlert, signInHrefFor } from '@/components/signup/IssuesAlert';
import { StepHeading } from '@/components/signup/SignupChrome';
import type { SignupIssue } from '@/components/signup/signup-shared';
import type { SignupState } from './signup-state';

/**
 * Step 3: where Νότης writes. WhatsApp/SMS is the recommended channel and
 * carries the phone field inside its card; the email summary is the smaller
 * second card. A signed-out reader also gives the name and the email that
 * make the account — the email is always needed, WhatsApp or not.
 */
export function ChannelsStep({
    state,
    signedIn,
    issues,
    saveError,
    onChange,
    onPhoneValidity,
}: {
    state: SignupState;
    signedIn: boolean;
    /** Shown once the reader has tried to submit. */
    issues: SignupIssue[];
    /** The save action's answer, as a key under `signup.errors`. */
    saveError: string | null;
    onChange: (patch: Partial<SignupState>) => void;
    onPhoneValidity: (validity: PhoneFieldValidity) => void;
}) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');

    return (
        <div>
            <StepHeading title={t('channelsTitle')} lead={t('channelsLead')} />

            <IssuesAlert saveError={saveError} issues={issues} signInHref={signInHrefFor(state.email)} />

            <div className="mt-5 flex flex-col gap-3">
                <CheckboxCard
                    checked={state.phoneChannel}
                    onCheckedChange={(phoneChannel) => onChange({ phoneChannel })}
                    label={t('phoneChannel')}
                    badge={t('recommended')}
                >
                    <div className="flex items-center gap-2.5 pb-3">
                        <Image
                            src="/logo.png"
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 shrink-0 rounded-full bg-muted object-contain p-0.5"
                        />
                        <p className="text-[13.5px] leading-[1.45] text-foreground/80">{t('phoneChannelBlurb')}</p>
                    </div>
                    <Label htmlFor="signup-phone" className="text-[13px] font-medium">
                        {ts('phone.label')}
                    </Label>
                    <div className="mt-1.5">
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
                    <p className="mt-1.5 text-xs leading-[1.4] text-muted-foreground">{t('phoneHint')}</p>
                </CheckboxCard>

                <CheckboxCard
                    checked={state.emailChannel}
                    onCheckedChange={(emailChannel) => onChange({ emailChannel })}
                    label={t('emailChannel')}
                    description={t('emailChannelBlurb')}
                    icon={<Mail className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
                />
            </div>

            {!signedIn && <AccountFields name={state.name} email={state.email} hint={t('accountHint')} onChange={onChange} />}

            <p className="mt-4 text-[11px] leading-[1.45] text-muted-foreground">
                {t('consent')}{' '}
                <Link href="/privacy" className="text-muted-foreground underline">
                    {ts('privacy')}
                </Link>
            </p>
        </div>
    );
}
