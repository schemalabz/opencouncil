'use client';

import { CheckCircle2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { CityCard } from '@/components/signup/CityCard';
import { NotisChatCard } from '@/components/signup/NotisChatCard';
import { StepHeading } from '@/components/signup/SignupChrome';
import type { CityWithGeometry } from '@/lib/db/cities';
import { isCustomer } from '@/lib/cityStatus';
import { getMunicipalityQualifier } from '@/lib/formatters/name';

/**
 * Step 1: the explainer, with the municipality already chosen. The entry
 * for a reader who arrives from the city page or a shared link; the picker
 * on /notifications sends its readers straight to step 2.
 *
 * Νότης's box sits in the column on a phone and beside it on a desktop
 * (IntroAside); the hidden copy never wakes, because it is never in view.
 */
export function IntroStep({ city, existing }: { city: CityWithGeometry; existing: boolean }) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');
    const tc = useTranslations('cityOverview');
    const locale = useLocale();
    const qualifier = getMunicipalityQualifier(city, locale);

    return (
        <div>
            <StepHeading eyebrow={t('eyebrow')} title={t(authorityKey('introTitle', city), { qualifier })} lead={t('lead')} />

            <CityCard
                city={city}
                className="mt-5 lg:mt-7"
                changeHref="/notifications"
                changeLabel={ts('changeCity')}
                status={
                    isCustomer(city.status) ? (
                        <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                            {t('officialSupport')}
                        </>
                    ) : undefined
                }
            />

            <NotisChatCard intro={tc(authorityKey('notisIntro', city))} className="mt-4 lg:hidden" />

            <p className="mt-3.5 text-xs leading-[1.45] text-muted-foreground lg:mt-5 lg:text-[13px]">
                {existing ? t('alreadySubscribedBody') : t('introNote')}
            </p>
        </div>
    );
}

/** Beside step 1 on a desktop: Νότης himself, in his box. */
export function IntroAside({ city }: { city: CityWithGeometry }) {
    const tc = useTranslations('cityOverview');
    return <NotisChatCard intro={tc(authorityKey('notisIntro', city))} />;
}
