'use client';

import Image from 'next/image';
import { CheckCircle2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { surfaceCardClass } from '@/components/ui/surface-card';
import type { CityWithGeometry } from '@/lib/db/cities';
import { isCustomer } from '@/lib/cityStatus';
import { getLocalizedMunicipalityName, getMunicipalityQualifier } from '@/lib/formatters/name';
import { cn } from '@/lib/utils';
import { NotisChatCard } from './NotisChatCard';
import { Eyebrow } from './SignupChrome';

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
    const tc = useTranslations('cityOverview');
    const locale = useLocale();
    const qualifier = getMunicipalityQualifier(city, locale);

    return (
        <div>
            <div className="flex flex-col gap-3 pt-6 lg:pt-8">
                <Eyebrow>{t('eyebrow')}</Eyebrow>
                <h1 className="text-[30px] font-normal leading-none tracking-[-0.02em] lg:text-[36px]">
                    {t(authorityKey('introTitle', city), { qualifier })}
                </h1>
                <p className="text-[15px] leading-[1.45] text-muted-foreground lg:text-base">{t('lead')}</p>
            </div>

            <div className={cn(surfaceCardClass, 'mt-5 flex items-center gap-3 px-3.5 py-3 lg:mt-7')}>
                <CitySeal name={city.name} logoImage={city.logoImage} />
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-tight">{getLocalizedMunicipalityName(city, locale)}</span>
                    {isCustomer(city.status) && (
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                            {t('officialSupport')}
                        </span>
                    )}
                </span>
                <Link
                    href="/notifications"
                    className="-my-3 inline-flex min-h-11 items-center whitespace-nowrap pl-3 text-[13px] text-[hsl(var(--orange-deep))] hover:no-underline"
                >
                    {t('changeCity')}
                </Link>
            </div>

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

/** A municipality's seal, or its initial where none is stored. */
export function CitySeal({ name, logoImage, size = 40 }: { name: string; logoImage: string | null; size?: number }) {
    if (logoImage) {
        return (
            <Image
                src={logoImage}
                alt=""
                width={size}
                height={size}
                className="shrink-0 rounded-full object-contain"
                style={{ width: size, height: size }}
            />
        );
    }
    return (
        <span
            className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            style={{ width: size, height: size, fontSize: size * 0.4 }}
            aria-hidden
        >
            {name.charAt(0)}
        </span>
    );
}
