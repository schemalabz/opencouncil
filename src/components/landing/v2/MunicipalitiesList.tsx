'use client';

import { ArrowRight, Bell, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters/time';
import type { LandingListCity, LandingPetitionedCity, UpcomingMeeting } from '@/lib/landing/landingData';
import { PETITION_DISPLAY_THRESHOLD, petitionFill } from '@/lib/landing/petitions';
import { CityAvatar } from './controls';
import { captureLandingAction } from '@/lib/landing/analytics';

/* Δήμοι tab — one card per municipality, the petitioned-δήμοι leaderboard, and a petition CTA.
   Selecting a card filters the map to that δήμος rather than navigating away, matching the mobile
   strip. */
export function MunicipalitiesList({
    cities,
    subjectCountByCity,
    upcoming,
    selectedCityId,
    onSelect,
    petitionedCities,
    petitionedBelowThreshold,
    onOpenPetitioned,
}: {
    cities: LandingListCity[];
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
    selectedCityId: string | null;
    onSelect: (id: string) => void;
    petitionedCities: LandingPetitionedCity[];
    petitionedBelowThreshold: number;
    onOpenPetitioned: (city: LandingPetitionedCity) => void;
}) {
    return (
        <>
            {cities.map((c) => (
                <MuniPanelCard
                    key={c.id}
                    city={c}
                    subjectCount={subjectCountByCity[c.id] ?? 0}
                    next={upcoming.find((m) => m.cityId === c.id)}
                    selected={selectedCityId === c.id}
                    onSelect={onSelect}
                />
            ))}
            <PetitionedLeaderboard cities={petitionedCities} belowThreshold={petitionedBelowThreshold} onOpen={onOpenPetitioned} />
            <PetitionCta big source="municipalities_list" />
        </>
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
                    ? 'gap-1.5 rounded-lg px-1 py-1 hover:enabled:bg-muted'
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

/* δήμος card — stats + next meeting. Clicking the card filters to that δήμος (orange border while
   selected, clicking again clears it); the bell opens its notifications and the arrow its page. */
function MuniPanelCard({
    city,
    subjectCount,
    next,
    selected,
    onSelect,
}: {
    city: LandingListCity;
    subjectCount: number;
    next?: UpcomingMeeting;
    selected: boolean;
    onSelect: (id: string) => void;
}) {
    const t = useTranslations('landingV2');
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(city.id)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(city.id);
                }
            }}
            aria-pressed={selected}
            className={cn(
                'group flex shrink-0 cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors',
                selected ? 'border-2 border-[hsl(var(--orange))]' : 'border-black/40 hover:border-black/60',
            )}
        >
            <div className="flex items-center gap-2.5">
                <CityAvatar city={city} />
                <span className="min-w-0 flex-1 text-lg font-bold tracking-tight text-foreground">{city.name}</span>
                {/* notifications bell — its own link, so it doesn't trigger the card's filter */}
                <Link
                    href={`/${city.id}/notifications`}
                    aria-label={next ? t('municipality.notifyMeeting', { name: city.name }) : t('municipality.notify', { name: city.name })}
                    onClick={(e) => {
                        e.stopPropagation();
                        captureLandingAction('notify_cta', { surface: 'municipalities_list', city_id: city.id });
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[hsl(var(--orange))] no-underline transition-colors hover:bg-muted/80 hover:no-underline"
                >
                    <Bell className="h-3.5 w-3.5" />
                </Link>
                {/* the only route to the municipality page now that the card itself filters */}
                <Link
                    href={`/${city.id}`}
                    aria-label={city.name}
                    onClick={(e) => {
                        e.stopPropagation();
                        captureLandingAction('city_opened', { city_id: city.id, source: 'municipalities_list' });
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground no-underline transition-transform hover:no-underline group-hover:translate-x-0.5"
                >
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <MuniStat label={t('municipality.subjects')} value={subjectCount} />
                <MuniStat label={t('municipality.meetings')} value={city._count.councilMeetings} />
                <MuniStat label={t('municipality.persons')} value={city._count.persons} />
            </div>
            {next && (
                <>
                    <div className="h-px bg-border" />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                            <span className="font-medium text-foreground/80">{t('municipality.nextMeeting')}</span>{' '}
                            {formatDateTime(new Date(next.dateTime))}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}

function MuniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg bg-muted/60 px-2.5 py-2">
            <div className="font-mono text-lg font-bold tabular-nums leading-none text-foreground">{value}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
        </div>
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
