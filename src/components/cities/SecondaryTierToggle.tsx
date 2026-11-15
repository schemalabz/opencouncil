"use client";
import { useId } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TIER_PARAM } from '@/lib/utils/bodyTier';

/**
 * The checkbox that widens a city tab to the secondary tier (#829): off by
 * default, and never part of "all". The choice lives in the URL, so a shared
 * link opens on the same view and the server page fetches for it. An
 * unticked box is a choice too: it holds where the tab would widen by itself.
 */
export function SecondaryTierToggle({ shown }: { shown: boolean }) {
    const t = useTranslations('Common');
    const id = useId();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const toggle = (checked: boolean) => {
        const params = new URLSearchParams(searchParams.toString());
        // A type chip or a body name of one tier means nothing in the other.
        params.delete('filters');
        params.delete('body');
        params.delete('page');
        // With the box ticked, the list's default is every body (see
        // meetingsTabFilters), so the new rows are on show.
        params.set(TIER_PARAM, checked ? 'all' : 'primary');
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    return (
        <div className="flex items-center gap-2">
            <Checkbox id={id} checked={shown} onCheckedChange={value => toggle(value === true)} />
            <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                {t('showYouthCouncils')}
            </Label>
        </div>
    );
}
