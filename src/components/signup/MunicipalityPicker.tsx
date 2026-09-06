'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { captureEvent } from '@/lib/analytics/capture';
import { isPetitionable } from '@/lib/cityStatus';
import type { CityMinimalWithCounts } from '@/lib/db/cities';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn, normalizeText } from '@/lib/utils';
import { CitySeal } from './CityCard';
import { Eyebrow } from './SignupChrome';

export type PickerMode = 'notifications' | 'petition';

/** The municipalities a signed-in reader is already in, so a row can say so. */
export interface PickerMembership {
    subscribedCityIds: string[];
    petitionedCityIds: string[];
}

/**
 * One list of municipalities for both flows, with a small search on top.
 *
 * In notifications mode the list is the municipalities Νότης serves; a
 * search also finds the ones he does not, and offers the petition for them.
 * In petition mode the list is every municipality that can be asked for,
 * and a search hit that already has notifications offers the signup
 * instead. A row the reader is already in says so, and its action changes
 * from joining to editing.
 */
export function MunicipalityPicker({
    cities,
    mode,
    membership,
    className,
}: {
    cities: CityMinimalWithCounts[];
    mode: PickerMode;
    membership: PickerMembership;
    className?: string;
}) {
    const t = useTranslations('signup');
    const [query, setQuery] = useState('');
    const needle = normalizeText(query.trim());

    const { primary, secondary } = useMemo(() => {
        // A word start, so «Θ» lists Θεσσαλονίκη and not every name with a theta
        // in it; anywhere in the name once the reader has typed a few letters.
        const hit = (value: string | null) => {
            if (!value) return false;
            const text = normalizeText(value);
            return text.split(/\s+/).some((word) => word.startsWith(needle)) || (needle.length >= 3 && text.includes(needle));
        };
        const matches = (city: CityMinimalWithCounts) =>
            !needle || [city.name, city.name_en, city.name_municipality, city.name_municipality_en].some(hit);
        const supported = cities.filter((city) => city.supportsNotifications);
        const petitionable = cities.filter((city) => !city.supportsNotifications && isPetitionable(city.status));
        const [first, second] = mode === 'notifications' ? [supported, petitionable] : [petitionable, supported];
        return {
            primary: first.filter(matches),
            secondary: needle ? second.filter(matches) : [],
        };
    }, [cities, mode, needle]);

    const subscribed = new Set(membership.subscribedCityIds);
    const petitioned = new Set(membership.petitionedCityIds);
    const nothingFound = needle !== '' && primary.length === 0 && secondary.length === 0;

    return (
        <div className={cn(surfaceCardClass, 'overflow-hidden', className)}>
            <label className="flex items-center gap-2.5 border-b border-border px-3.5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('picker.searchPlaceholder')}
                    aria-label={t('picker.searchLabel')}
                    autoComplete="off"
                    className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
                />
            </label>

            {nothingFound && (
                <div className="flex flex-col gap-1 px-3.5 py-4">
                    <span className="text-sm text-muted-foreground">{t('picker.noResults', { query: query.trim() })}</span>
                    {mode === 'notifications' && (
                        <Link
                            href="/petition"
                            className="group/cta inline-flex min-h-10 items-center gap-1.5 self-start text-sm text-[hsl(var(--orange-deep))] hover:no-underline"
                        >
                            {t('picker.noResultsPetition')}
                            <ArrowRight className="h-[15px] w-[15px] transition-transform group-hover/cta:translate-x-0.5" aria-hidden />
                        </Link>
                    )}
                </div>
            )}

            <ul>
                {primary.map((city) => (
                    <PickerRow
                        key={city.id}
                        city={city}
                        kind={mode === 'notifications' ? 'signup' : 'petition'}
                        member={mode === 'notifications' ? subscribed.has(city.id) : petitioned.has(city.id)}
                        surface={mode}
                    />
                ))}
            </ul>

            {secondary.length > 0 && (
                <>
                    <div className="border-y border-border bg-muted/40 px-3.5 py-1.5">
                        <Eyebrow>{mode === 'notifications' ? t('picker.notSupportedYet') : t('picker.supportedAlready')}</Eyebrow>
                    </div>
                    <ul>
                        {secondary.map((city) => (
                            <PickerRow
                                key={city.id}
                                city={city}
                                kind={mode === 'notifications' ? 'petition' : 'signup'}
                                member={mode === 'notifications' ? petitioned.has(city.id) : subscribed.has(city.id)}
                                surface={mode}
                            />
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}

/**
 * One municipality, one tap. A signup row lands on step 2 of the
 * notifications signup — the reader has just read the explainer; a petition
 * row lands on step 2 of the petition for the same reason.
 */
function PickerRow({
    city,
    kind,
    member,
    surface,
}: {
    city: CityMinimalWithCounts;
    kind: 'signup' | 'petition';
    /** The reader is already in: subscribed, or on the petition. */
    member: boolean;
    surface: PickerMode;
}) {
    const t = useTranslations('signup');
    const locale = useLocale();
    const name = getLocalizedName(city, locale);
    const href = kind === 'signup' ? `/${city.id}/notifications?step=2` : `/${city.id}/petition?step=2`;
    const action =
        kind === 'signup'
            ? member
                ? t('picker.changePreferences')
                : t('picker.signUp')
            : member
              ? t('picker.changeRequest')
              : t('picker.request');
    const memberLabel = kind === 'signup' ? t('picker.subscribed') : t('picker.requested');

    return (
        <li className="border-b border-border/60 last:border-b-0">
            <Link
                href={href}
                onClick={() =>
                    captureEvent(kind === 'signup' ? 'notification_city_picked' : 'petition_city_picked', {
                        city_id: city.id,
                        surface,
                        member,
                    })
                }
                className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/40 hover:no-underline"
            >
                <CitySeal name={name} logoImage={city.logoImage} size={34} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-tight">{name}</span>
                    {member ? (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {memberLabel}
                        </span>
                    ) : (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {getLocalizedMunicipalityName(city, locale)}
                        </span>
                    )}
                </span>
                <span className="shrink-0 text-[13px] text-[hsl(var(--orange-deep))]">{action}</span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
            </Link>
        </li>
    );
}
