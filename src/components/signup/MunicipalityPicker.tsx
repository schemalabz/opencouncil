'use client';

import { useMemo } from 'react';
import { CheckCircle2, ChevronRight, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useQueryParamState } from '@/hooks/useQueryParamState';
import { captureEvent } from '@/lib/analytics/capture';
import { isPetitionable } from '@/lib/cityStatus';
import type { CityMinimalWithCounts } from '@/lib/db/cities';
import type { PetitionBucket } from '@/lib/landing/petitions';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { CtaButton } from '@/components/ui/cta-button';
import { cn, normalizeText } from '@/lib/utils';
import { CitySeal } from './CityCard';
import { Eyebrow } from './SignupChrome';

export type PickerMode = 'notifications' | 'petition';

/** The search, as both pages carry it: `/petition?q=…`, `/notifications?q=…`. */
export const QUERY_PARAM = 'q';

/** A municipality with enough petitions to be shown, in the landing map's rank order. */
export interface PetitionedEntry {
    id: string;
    /** The public "N+" bucket; the exact count never reaches the client. */
    bucket: PetitionBucket;
}

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
 * In petition mode the list is the municipalities already being asked for,
 * ranked as the landing map ranks them (`petitioned`, 10+ petitions, exact
 * counts never shown) — a few hundred more can be asked for, and the search
 * finds every one of them. A search hit that already has notifications
 * offers the signup instead. A row the reader is already in says so, and
 * its action changes from joining to editing.
 *
 * A search that finds nothing in notifications mode sends the reader to the
 * petition with what they typed, and the petition's picker starts from it —
 * a municipality that is not here yet is exactly the one to ask for.
 *
 * The search lives in the URL (`?q=`), so Back brings the reader to the list
 * they left rather than to the default order, and a row carries it on to the
 * flow so the step's «Αλλαγή» link can bring the reader back to this same
 * list. See `useQueryParamState`.
 */
export function MunicipalityPicker({
    cities,
    mode,
    membership,
    petitioned = [],
    initialQuery = '',
    className,
}: {
    cities: CityMinimalWithCounts[];
    mode: PickerMode;
    membership: PickerMembership;
    /** Petition mode: the municipalities to list before any search, ranked. */
    petitioned?: PetitionedEntry[];
    initialQuery?: string;
    className?: string;
}) {
    const t = useTranslations('signup');
    const [query, setQuery, flushQuery] = useQueryParamState(QUERY_PARAM, initialQuery);
    const needle = normalizeText(query.trim());

    // Rank and bucket by id, so a row can say «10+ δημότες το ζήτησαν ήδη»
    // and a search keeps the asked-for municipalities on top.
    const petitionedById = useMemo(() => new Map(petitioned.map((entry, rank) => [entry.id, { ...entry, rank }])), [petitioned]);

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
        const rankOf = (city: CityMinimalWithCounts) => petitionedById.get(city.id)?.rank ?? Number.MAX_SAFE_INTEGER;
        const petitionable = cities
            .filter((city) => !city.supportsNotifications && isPetitionable(city.status))
            .sort((a, b) => rankOf(a) - rankOf(b));
        if (mode === 'petition' && !needle) {
            return { primary: petitionable.filter((city) => petitionedById.has(city.id)), secondary: [] };
        }
        const [first, second] = mode === 'notifications' ? [supported, petitionable] : [petitionable, supported];
        return {
            primary: first.filter(matches),
            secondary: needle ? second.filter(matches) : [],
        };
    }, [cities, mode, needle, petitionedById]);

    const subscribed = new Set(membership.subscribedCityIds);
    const petitionedBy = new Set(membership.petitionedCityIds);
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
                        <CtaButton
                            href={`/petition?${QUERY_PARAM}=${encodeURIComponent(query.trim())}`}
                            variant="text"
                            className="min-h-10"
                        >
                            {t('picker.noResultsPetition')}
                        </CtaButton>
                    )}
                </div>
            )}

            <ul>
                {primary.map((city) => (
                    <PickerRow
                        key={city.id}
                        city={city}
                        kind={mode === 'notifications' ? 'signup' : 'petition'}
                        member={mode === 'notifications' ? subscribed.has(city.id) : petitionedBy.has(city.id)}
                        bucket={petitionedById.get(city.id)?.bucket ?? null}
                        surface={mode}
                        query={query}
                        onNavigate={flushQuery}
                    />
                ))}
            </ul>

            {mode === 'petition' && !needle && (
                <p className="border-t border-border px-3.5 py-3 text-sm text-muted-foreground">{t('picker.searchForYours')}</p>
            )}

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
                                member={mode === 'notifications' ? petitionedBy.has(city.id) : subscribed.has(city.id)}
                                bucket={petitionedById.get(city.id)?.bucket ?? null}
                                surface={mode}
                                query={query}
                                onNavigate={flushQuery}
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
 *
 * The row carries the search along, so the step's «Αλλαγή» link can return
 * the reader to the list they picked from instead of the default order.
 */
function PickerRow({
    city,
    kind,
    member,
    bucket,
    surface,
    query,
    onNavigate,
}: {
    city: CityMinimalWithCounts;
    kind: 'signup' | 'petition';
    /** The reader is already in: subscribed, or on the petition. */
    member: boolean;
    /** How many have asked already, as the public "N+" bucket; null when too few to say. */
    bucket: PetitionBucket | null;
    surface: PickerMode;
    /** What the reader searched for, carried on to the flow. */
    query: string;
    /** Writes the pending search to the URL before this row navigates away. */
    onNavigate: () => void;
}) {
    const t = useTranslations('signup');
    const locale = useLocale();
    const name = getLocalizedName(city, locale);
    const params = new URLSearchParams({ step: '2' });
    if (query.trim()) params.set(QUERY_PARAM, query.trim());
    const href = `/${city.id}/${kind === 'signup' ? 'notifications' : 'petition'}?${params.toString()}`;
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
                onClick={() => {
                    // The debounced write has not run yet when a row is tapped
                    // straight after typing; without this the list the reader
                    // came from is not in the URL to go back to.
                    onNavigate();
                    captureEvent(kind === 'signup' ? 'notification_city_picked' : 'petition_city_picked', {
                        city_id: city.id,
                        surface,
                        member,
                    });
                }}
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
                            {bucket !== null ? t('picker.petitioned', { count: bucket }) : getLocalizedMunicipalityName(city, locale)}
                        </span>
                    )}
                </span>
                <span className="shrink-0 text-[13px] text-[hsl(var(--orange-deep))]">{action}</span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
            </Link>
        </li>
    );
}
