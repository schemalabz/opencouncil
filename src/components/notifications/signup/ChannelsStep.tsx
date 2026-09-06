'use client';

import Image from 'next/image';
import { AlertCircle, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField, type PhoneFieldValidity } from '@/components/ui/phone-field';
import { ChannelCard } from './ChannelCard';
import { Eyebrow, StepHeading } from './SignupChrome';
import type { SignupIssue, SignupState } from './signup-state';

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
    /** The save action's answer, as a key under `errors`. */
    saveError: string | null;
    onChange: (patch: Partial<SignupState>) => void;
    onPhoneValidity: (validity: PhoneFieldValidity) => void;
}) {
    const t = useTranslations('notificationSignup');
    const signInHref = `/sign-in?callbackUrl=${encodeURIComponent(
        typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search,
    )}&email=${encodeURIComponent(state.email.trim())}`;

    return (
        <div>
            <StepHeading title={t('channelsTitle')} lead={t('channelsLead')} />

            {(saveError || issues.length > 0) && (
                <div
                    role="alert"
                    className="mt-5 flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div className="flex flex-col gap-1">
                        {saveError && (
                            <p>
                                {t(`errors.${saveError}`)}
                                {saveError === 'emailExists' && (
                                    <>
                                        {' '}
                                        <Link href={signInHref} className="underline">
                                            {t('errors.signIn')}
                                        </Link>
                                    </>
                                )}
                            </p>
                        )}
                        {issues.map((issue) => (
                            <p key={issue}>{t(`issues.${issue}`)}</p>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-5 flex flex-col gap-3">
                <ChannelCard
                    checked={state.phoneChannel}
                    onToggle={() => onChange({ phoneChannel: !state.phoneChannel })}
                    title={t('phoneChannel')}
                    badge={t('recommended')}
                    emphasized
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
                        {t('phoneLabel')}
                    </Label>
                    <div className="mt-1.5">
                        <PhoneField
                            id="signup-phone"
                            value={state.phone}
                            onChange={(phone) => onChange({ phone })}
                            onValidityChange={onPhoneValidity}
                            placeholder={t('phonePlaceholder')}
                            activePlaceholder={t('phonePlaceholder')}
                            invalidMessage={t('errors.phoneInvalid')}
                            notMobileMessage={t('errors.phoneNotMobile')}
                        />
                    </div>
                    <p className="mt-1.5 text-xs leading-[1.4] text-muted-foreground">{t('phoneHint')}</p>
                </ChannelCard>

                <ChannelCard
                    checked={state.emailChannel}
                    onToggle={() => onChange({ emailChannel: !state.emailChannel })}
                    title={t('emailChannel')}
                    description={t('emailChannelBlurb')}
                    icon={<Mail className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
                />
            </div>

            {!signedIn && (
                <section className="mt-7 flex flex-col gap-1">
                    <Eyebrow>{t('accountEyebrow')}</Eyebrow>
                    <span className="text-xs text-muted-foreground">{t('accountHint')}</span>

                    <div className="mt-3 flex flex-col gap-1.5">
                        <Label htmlFor="signup-name" className="text-[13px] font-medium">
                            {t('nameLabel')}
                        </Label>
                        <Input
                            id="signup-name"
                            type="text"
                            autoComplete="name"
                            value={state.name}
                            onChange={(e) => onChange({ name: e.target.value })}
                            placeholder={t('namePlaceholder')}
                            className="h-11 text-base md:text-sm"
                        />
                    </div>

                    <div className="mt-3.5 flex flex-col gap-1.5">
                        <Label htmlFor="signup-email" className="text-[13px] font-medium">
                            {t('emailLabel')}
                        </Label>
                        <Input
                            id="signup-email"
                            type="email"
                            autoComplete="email"
                            inputMode="email"
                            value={state.email}
                            onChange={(e) => onChange({ email: e.target.value })}
                            placeholder={t('emailPlaceholder')}
                            className="h-11 text-base md:text-sm"
                        />
                        <p className="text-xs leading-[1.4] text-muted-foreground">{t('emailHint')}</p>
                    </div>
                </section>
            )}

            <p className="mt-4 text-[11px] leading-[1.45] text-muted-foreground">
                {t('consent')}{' '}
                <Link href="/privacy" className="text-muted-foreground underline">
                    {t('privacy')}
                </Link>
            </p>
        </div>
    );
}
