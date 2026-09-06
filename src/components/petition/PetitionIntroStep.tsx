'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { CityCard } from '@/components/signup/CityCard';
import { NotisChatCard } from '@/components/signup/NotisChatCard';
import { Eyebrow } from '@/components/signup/SignupChrome';
import type { CityWithGeometry } from '@/lib/db/cities';
import { getMunicipalityQualifier } from '@/lib/formatters/name';
import type { PetitionBucket } from '@/lib/landing/petitions';

/**
 * Step 1: why the municipality is not here yet and what a name does about
 * it. The card shows how many have asked already, in the same coarse
 * buckets the landing map uses. Νότης's box shows what the reader is
 * asking for; it sits in the column on a phone and beside it on a desktop
 * (PetitionIntroAside).
 */
export function PetitionIntroStep({
    city,
    bucket,
    existing,
}: {
    city: CityWithGeometry;
    bucket: PetitionBucket | null;
    existing: boolean;
}) {
    const t = useTranslations('petition');
    const ts = useTranslations('signup');
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

            <CityCard
                city={city}
                className="mt-5 lg:mt-7"
                changeHref="/petition"
                changeLabel={ts('changeCity')}
                status={bucket !== null ? tc('petitionCount', { count: bucket }) : t('notInNetwork')}
            />

            <NotisChatCard intro={t('whatYouGet')} className="mt-4 lg:hidden" />

            <p className="mt-3.5 text-xs leading-[1.45] text-muted-foreground lg:mt-5 lg:text-[13px]">
                {existing ? t('alreadyRequestedBody') : t('introNote')}
            </p>
            {!existing && (
                <p className="mt-2 text-xs leading-[1.45] text-muted-foreground lg:text-[13px]">
                    {t.rich('pricingNote', {
                        link: (chunks) => (
                            <Link href="/about" className="underline">
                                {chunks}
                            </Link>
                        ),
                    })}
                </p>
            )}
        </div>
    );
}

/** Beside step 1 on a desktop: what the reader is asking for. */
export function PetitionIntroAside() {
    const t = useTranslations('petition');
    return <NotisChatCard intro={t('whatYouGet')} />;
}
