'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { MemberNote } from '@/components/signup/MemberNote';
import { StepHeading } from '@/components/signup/SignupChrome';
import type { CityWithGeometry } from '@/lib/db/cities';
import { getMunicipalityQualifier } from '@/lib/formatters/name';
import type { PetitionBucket } from '@/lib/landing/petitions';
import { PetitionCityCard } from './PetitionCityCard';

/**
 * Step 1: why the municipality is not here yet and what a name does about
 * it. The card shows how many have asked already, in the same coarse
 * buckets the landing map uses. Νότης stays out of it: the petition asks
 * for the municipality, not for him.
 */
export function PetitionIntroStep({
    city,
    bucket,
    pickerQuery,
    dirty,
    existing,
}: {
    city: CityWithGeometry;
    bucket: PetitionBucket | null;
    pickerQuery: string;
    dirty: boolean;
    existing: boolean;
}) {
    const t = useTranslations('petition');
    const ts = useTranslations('signup');
    const locale = useLocale();
    const qualifier = getMunicipalityQualifier(city, locale);

    return (
        <div>
            <StepHeading eyebrow={t('eyebrow')} title={t(authorityKey('introTitle', city), { qualifier })} lead={t('lead')} />

            <PetitionCityCard city={city} bucket={bucket} pickerQuery={pickerQuery} dirty={dirty} className="mt-5 lg:mt-7" />

            {existing ? (
                <MemberNote title={ts('picker.requested')} body={t('alreadyRequestedBody')} className="mt-3.5 lg:mt-5" />
            ) : (
                <p className="mt-3.5 text-xs leading-[1.45] text-muted-foreground lg:mt-5 lg:text-[13px]">{t('introNote')}</p>
            )}
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
