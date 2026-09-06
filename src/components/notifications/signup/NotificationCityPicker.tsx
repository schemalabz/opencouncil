'use client';

import { ChevronRight } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { captureEvent } from '@/lib/analytics/capture';
import type { CitySupportingNotifications } from '@/lib/db/cities';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';
import { CitySeal } from './IntroStep';

/**
 * One tap per municipality, straight to step 2: the reader has just read
 * the explainer above the list. No search — the list is the municipalities
 * Νότης serves, and there are few enough to scan.
 */
export function NotificationCityPicker({
    cities,
    className,
}: {
    cities: CitySupportingNotifications[];
    className?: string;
}) {
    const locale = useLocale();
    return (
        <ul className={cn(surfaceCardClass, 'overflow-hidden', className)}>
            {cities.map((city, index) => {
                const name = getLocalizedName(city, locale);
                return (
                    <li key={city.id} className={cn(index > 0 && 'border-t border-border/60')}>
                        <Link
                            href={`/${city.id}/notifications?step=2`}
                            onClick={() => captureEvent('notification_city_picked', { city_id: city.id })}
                            className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/40 hover:no-underline"
                        >
                            <CitySeal name={name} logoImage={city.logoImage} size={34} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] leading-tight">{name}</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {getLocalizedMunicipalityName(city, locale)}
                                </span>
                            </span>
                            <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
