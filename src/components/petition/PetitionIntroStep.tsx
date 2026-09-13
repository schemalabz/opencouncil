'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { CityCard } from '@/components/signup/CityCard';
import { StepHeading } from '@/components/signup/SignupChrome';
import type { CityWithGeometry } from '@/lib/db/cities';
import { getMunicipalityQualifier } from '@/lib/formatters/name';
import type { PetitionBucket } from '@/lib/landing/petitions';

/**
 * Step 1: why the municipality is not here yet and what a name does about
 * it. The card shows how many have asked already, in the same coarse
 * buckets the landing map uses. Νότης stays out of it: the petition asks
 * for the municipality, not for him.
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
            <StepHeading eyebrow={t('eyebrow')} title={t(authorityKey('introTitle', city), { qualifier })} lead={t('lead')} />

            <CityCard
                city={city}
                className="mt-5 lg:mt-7"
                changeHref="/petition"
                changeLabel={ts('changeCity')}
                status={bucket !== null ? tc('petitionCount', { count: bucket }) : t('notInNetwork')}
            />

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
