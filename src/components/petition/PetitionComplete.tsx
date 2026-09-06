'use client';

import { BookOpen, Check, Landmark } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { MeanwhileLinks, type MeanwhileLink } from '@/components/signup/MeanwhileLinks';
import type { CityWithGeometry } from '@/lib/db/cities';
import { getMunicipalityQualifier } from '@/lib/formatters/name';

/**
 * Done. The name is on the list, and the reader hears from us when the
 * municipality joins — that is the whole promise, so the screen makes no
 * other. The "meanwhile" links sit under it on a phone and beside it on a
 * desktop (PetitionCompleteAside).
 */
export function PetitionComplete({
    city,
    updated,
    signedIn,
}: {
    city: CityWithGeometry;
    /** The reader had signed before and changed their details. */
    updated: boolean;
    signedIn: boolean;
}) {
    const t = useTranslations('petition');
    const ts = useTranslations('signup');
    const locale = useLocale();
    const qualifier = getMunicipalityQualifier(city, locale);

    return (
        <div>
            <div className="flex flex-col gap-3 pt-6 lg:pt-10">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600" aria-hidden>
                    <Check className="h-5 w-5 text-white" strokeWidth={2.6} />
                </span>
                <h1 className="mt-1 text-[30px] font-normal leading-none tracking-[-0.02em] lg:text-[36px]">
                    {updated ? t('doneTitleUpdated') : t('doneTitle')}
                </h1>
                <p className="text-[15px] leading-[1.45] text-muted-foreground lg:text-base">
                    {t(authorityKey('doneLead', city), { qualifier })}
                </p>
            </div>

            <MeanwhileLinks className="mt-7 lg:hidden" eyebrow={t('meanwhileEyebrow')} items={useMeanwhile()} />

            <p className="mt-4 pb-8 text-[11px] leading-[1.45] text-muted-foreground lg:mt-6 lg:text-xs">
                {!signedIn && <>{ts('doneMagicLink')} </>}
                {t('consent')}
            </p>
        </div>
    );
}

/** Beside the completion screen on a desktop: where to go in the meantime. */
export function PetitionCompleteAside() {
    const t = useTranslations('petition');
    return <MeanwhileLinks eyebrow={t('meanwhileEyebrow')} items={useMeanwhile()} />;
}

function useMeanwhile(): MeanwhileLink[] {
    const t = useTranslations('petition');
    return [
        { href: '/explain', icon: BookOpen, title: t('meanwhileExplain'), hint: t('meanwhileExplainHint') },
        { href: '/petition', icon: Landmark, title: t('meanwhileOther'), hint: t('meanwhileOtherHint') },
    ];
}
