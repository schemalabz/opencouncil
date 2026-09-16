'use client';

import { ArrowRight, Bell, CalendarDays, MapPin, Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters/time';
import type { LandingListCity, LandingPetitionedCity, UpcomingMeeting } from '@/lib/landing/landingData';
import { PETITION_DISPLAY_THRESHOLD, petitionFill } from '@/lib/landing/petitions';
import { CityAvatar, MunicipalityStats } from './controls';
import { captureLandingAction } from '@/lib/landing/analytics';

/* Δήμοι tab — one card per municipality, the petitioned-δήμοι leaderboard, and a petition CTA.
   A card opens its δήμος's page; its "Στον χάρτη" chip filters the map to the δήμος instead,
   matching the mobile strip. The lists arrive already narrowed by the tab's search box;
   `noMatch` says the search emptied both, so the tab can say so rather than show nothing. */
export function MunicipalitiesList({
    cities,
    subjectCountByCity,
    upcoming,
    selectedCityId,
    onShowOnMap,
    petitionedCities,
    petitionedBelowThreshold,
    onOpenPetitioned,
    noMatch,
}: {
    cities: LandingListCity[];
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
    selectedCityId: string | null;
    /** the "Στον χάρτη" chip — filter the map to that δήμος (a second call clears it) */
    onShowOnMap: (id: string) => void;
    petitionedCities: LandingPetitionedCity[];
    petitionedBelowThreshold: number;
    onOpenPetitioned: (city: LandingPetitionedCity) => void;
    /** a name search is on and nothing — no δήμος, no petitioned δήμος — answers it */
    noMatch?: boolean;
}) {
    const t = useTranslations('landingV2');
    return (
        <>
            {cities.map((c) => (
                <MunicipalityCard
                    key={c.id}
                    city={c}
                    subjectCount={subjectCountByCity[c.id] ?? 0}
                    next={upcoming.find((m) => m.cityId === c.id)}
                    selected={selectedCityId === c.id}
                    onShowOnMap={onShowOnMap}
                />
            ))}
            <PetitionedLeaderboard cities={petitionedCities} belowThreshold={petitionedBelowThreshold} onOpen={onOpenPetitioned} />
            {noMatch && <p className="px-1 py-1 text-sm text-muted-foreground">{t('municipality.noMatch')}</p>}
            <PetitionCta big source="municipalities_list" />
        </>
    );
}

/* The Δήμοι tab's name search — a quiet field in the panel header that narrows the cards and the
   petition leaderboard as you type (see matchesMunicipalityName for what counts as a match). */
export function MunicipalitySearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const t = useTranslations('landingV2');
    return (
        <label className="flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-foreground transition-colors focus-within:border-foreground/40">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t('municipality.searchPlaceholder')}
                aria-label={t('municipality.searchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label={t('common.clear')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
        </label>
    );
}

/* One leaderboard row — rank · name · "N+" badge on the petition ramp. THE row markup for every
   surface (desktop panel and mobile strip card), so the two can't drift; `dense` is the strip's
   compact styling. Rows render in server order (ORDER BY count DESC, name) — the rank is the
   array index. A row without geometry is informational only: nothing to focus on the map.
   `aria-label` leads with the visible `name` (WCAG 2.5.3 — speech activation matches the label). */
export function PetitionedRow({
    city,
    rank,
    onOpen,
    dense,
}: {
    city: LandingPetitionedCity;
    rank: number;
    onOpen: (city: LandingPetitionedCity) => void;
    dense?: boolean;
}) {
    const t = useTranslations('landingV2');
    const fill = petitionFill(city.intensity);
    const focusable = !!city.geometry;
    return (
        <button
            type="button"
            disabled={!focusable}
            onClick={() => onOpen(city)}
            aria-label={t('marker.petitionedAria', { name: city.name, count: city.bucket })}
            className={cn(
                'flex items-center text-left transition-colors',
                dense
                    ? 'gap-1.5 rounded-lg px-1 py-0.5 hover:enabled:bg-muted'
                    : 'gap-2.5 rounded-xl border border-black/20 bg-card px-3 py-2 shadow-sm hover:enabled:border-black/50',
                !focusable && 'cursor-default',
            )}
        >
            <span
                className={cn(
                    'shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground',
                    dense ? 'w-4' : 'w-5',
                )}
            >
                {rank}.
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{city.name}</span>
            <span
                className={cn(
                    'shrink-0 rounded-full font-bold tabular-nums',
                    dense ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
                )}
                style={{ backgroundColor: fill.background, color: fill.text }}
            >
                {city.bucket}+
            </span>
        </button>
    );
}

/* Leaderboard of out-of-network δήμοι by petitions — deliberately thin rows, so the real δήμοι
   keep the visual weight. A row focuses that δήμος on the map, same as clicking its blue bubble.
   Renders whenever there is anything to say: rows, or even just the below-threshold tail — in a
   young deployment that tail may be the only petition signal there is. */
export function PetitionedLeaderboard({
    cities,
    belowThreshold,
    onOpen,
}: {
    cities: LandingPetitionedCity[];
    /** δήμοι with petitions under the display threshold — an aggregate count, never a list */
    belowThreshold: number;
    onOpen: (city: LandingPetitionedCity) => void;
}) {
    const t = useTranslations('landingV2');
    if (!cities.length && belowThreshold <= 0) return null;
    return (
        <div className="flex shrink-0 flex-col gap-1.5">
            <div className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('municipality.petitionedTitle')}
            </div>
            {cities.map((c, i) => (
                <PetitionedRow key={c.id} city={c} rank={i + 1} onOpen={onOpen} />
            ))}
            {belowThreshold > 0 && (
                <p className="px-1 pt-0.5 text-xs text-muted-foreground">
                    {t('municipality.petitionedMore', { count: belowThreshold, threshold: PETITION_DISPLAY_THRESHOLD })}
                </p>
            )}
        </div>
    );
}

/* One δήμος card, for the desktop panel (`panel`) and the phone strip (`strip`). The whole card
   opens the municipality's page: the header row is the link and its ::after stretches over the
   card, while the two chips at the foot sit above it — the δήμος's notifications, and "Στον
   χάρτη", which filters the map to the δήμος (orange while it is the filter; a second tap clears
   it). The numbers ride under the name as one quiet line, so the card stays short. */
export function MunicipalityCard({
    city,
    subjectCount,
    next,
    selected,
    onShowOnMap,
    variant = 'panel',
}: {
    city: LandingListCity;
    subjectCount: number;
    next?: UpcomingMeeting;
    /** the δήμος is the map's current filter */
    selected: boolean;
    onShowOnMap: (id: string) => void;
    variant?: 'panel' | 'strip';
}) {
    const t = useTranslations('landingV2');
    const locale = useLocale();
    const strip = variant === 'strip';
    const nextLine = next
        ? formatDateTime(new Date(next.dateTime), next.city.timezone, strip ? 'medium' : 'long', locale)
        : null;
    return (
        <div
            data-city-id={city.id}
            className={cn(
                'group relative flex shrink-0 flex-col rounded-2xl border bg-card transition-colors',
                strip ? 'h-full w-[280px] p-3 shadow-md' : 'p-4 shadow-sm',
                selected
                    ? 'border-[hsl(var(--orange))] ring-1 ring-[hsl(var(--orange))]'
                    : strip
                      ? 'border-black/20 hover:border-black/40'
                      : 'border-black/40 hover:border-black/70',
            )}
        >
            {/* the link — its ::after covers the whole card, so a tap anywhere but a chip opens the page */}
            <Link
                href={`/${city.id}`}
                prefetch={false}
                onClick={() => captureLandingAction('city_opened', { city_id: city.id, source: 'municipalities_list' })}
                className="flex items-center gap-3 no-underline after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:no-underline"
            >
                <CityAvatar city={city} />
                <span className={cn('min-w-0 flex-1 truncate font-bold tracking-tight text-foreground', strip ? 'text-[15px]' : 'text-lg')}>
                    {city.name}
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-[hsl(var(--orange))] transition-transform group-hover:translate-x-0.5" />
            </Link>

            {/* the numbers — one quiet line of their own, so the whole line fits beside nothing */}
            <div className={cn('truncate text-muted-foreground', strip ? 'mt-2 text-[11px]' : 'mt-2.5 text-xs')}>
                <MunicipalityStats subjects={subjectCount} meetings={city._count.councilMeetings} persons={city._count.persons} />
            </div>

            {nextLine && (
                <div className={cn('flex items-center gap-1.5 text-muted-foreground', strip ? 'mt-1 text-[11px]' : 'mt-1.5 text-xs')}>
                    <CalendarDays className={cn('shrink-0', strip ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
                    <span className="truncate">
                        {!strip && <span className="font-medium text-foreground/80">{t('municipality.nextMeeting')} </span>}
                        {nextLine}
                    </span>
                </div>
            )}

            {/* the chips sit above the stretched link (positioned + z), so they take the tap */}
            <div className={cn('relative z-10 flex items-center gap-2', strip ? 'mt-auto pt-2' : 'mt-3')}>
                <Link
                    href={`/${city.id}/notifications`}
                    aria-label={next ? t('municipality.notifyMeeting', { name: city.name }) : t('municipality.notify', { name: city.name })}
                    onClick={() => captureLandingAction('notify_cta', { surface: 'municipalities_list', city_id: city.id })}
                    className={cn(chipClass(strip), 'no-underline hover:no-underline')}
                >
                    <Bell className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--orange))]" />
                    {t('municipality.notifications')}
                </Link>
                <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onShowOnMap(city.id)}
                    className={cn(
                        chipClass(strip),
                        selected &&
                            'border-[hsl(var(--orange))] bg-[hsl(24,100%,96%)] text-[hsl(var(--orange))] hover:border-[hsl(var(--orange))] hover:text-[hsl(var(--orange))]',
                    )}
                >
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {t('municipality.showOnMap')}
                </button>
            </div>
        </div>
    );
}

/* the card's foot chips — pill-shaped, quiet until hovered; `dense` is the strip size */
function chipClass(dense: boolean) {
    return cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background font-semibold text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground',
        dense ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-xs',
    );
}

/* Petition CTA — closes the Δήμοι tab (`big`); also shown in search for an uncovered
   municipality (`unknownName` tailors the copy). Links to the petition page. */
export function PetitionCta({
    unknownName,
    big,
    source,
}: {
    unknownName?: string;
    big?: boolean;
    /** where the CTA lives, for the petition-entry analytics event */
    source: 'municipalities_list' | 'search';
}) {
    const t = useTranslations('landingV2');
    return (
        <Link
            href="/petition"
            onClick={() => captureLandingAction('petition_started', { source, city_name: unknownName ?? null })}
            className={cn(
                'flex shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background text-center font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground',
                big ? 'gap-3 px-6 py-6 text-base' : 'px-4 py-3 text-sm',
                !unknownName && 'h-24'
            )}
        >
            {unknownName
                ? t('municipality.unavailable', { name: unknownName })
                : t('municipality.notSeeing')}
            <ArrowRight className={cn('shrink-0', big ? 'h-5 w-5' : 'h-4 w-4')} />
        </Link>
    );
}
