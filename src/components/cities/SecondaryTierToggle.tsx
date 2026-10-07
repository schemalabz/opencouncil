"use client";
import { useId } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SECONDARY_BODY_TYPES, TIER_PARAM } from '@/lib/utils/bodyTier';

/**
 * The checkbox that widens a city tab to the secondary tier (#829): off by
 * default, and never part of "all". The choice lives in the URL, so a shared
 * link opens on the same view and the server page fetches for it.
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
        if (checked) {
            params.set(TIER_PARAM, 'all');
            // Land on the tier just asked for: the list's own default chip is
            // the council, under which the new rows would stay out of sight.
            // The list keys its chips by the type label (see getAdministrativeBodyTypes).
            params.set('filters', SECONDARY_BODY_TYPES.map(type => t(`adminBodyType_${type}`)).join(','));
        } else {
            params.delete(TIER_PARAM);
        }
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
