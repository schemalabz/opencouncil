'use client';

import { ArrowRight, Bell, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters/time';
import type { LandingListCity, UpcomingMeeting } from '@/lib/landing/landingData';
import { CityAvatar } from './controls';
import { captureLandingAction } from '@/lib/landing/analytics';

/* Δήμοι tab — one card per municipality + a petition CTA. Selecting a card filters the map to that
   δήμος rather than navigating away, matching the mobile strip. */
export function MunicipalitiesList({
    cities,
    subjectCountByCity,
    upcoming,
    selectedCityId,
    onSelect,
}: {
    cities: LandingListCity[];
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
    selectedCityId: string | null;
    onSelect: (id: string) => void;
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
            <PetitionCta big source="municipalities_list" />
        </>
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

/* petition CTA — closes the Δήμοι tab (`big`); also shown in search for an uncovered
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
            )}
        >
            {unknownName
                ? t('municipality.unavailable', { name: unknownName })
                : t('municipality.notSeeing')}
            <ArrowRight className={cn('shrink-0', big ? 'h-5 w-5' : 'h-4 w-4')} />
        </Link>
    );
}
