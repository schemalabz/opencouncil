'use client';

import { ArrowRight, Bell, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/formatters/time';
import type { LandingListCity, UpcomingMeeting } from '@/lib/landing/landingData';
import { CityAvatar } from './controls';
import { captureLandingAction } from '@/lib/landing/analytics';

/* Δήμοι tab — one card per municipality + a petition CTA. Shared by desktop panel and mobile sheet. */
export function MunicipalitiesList({
    cities,
    subjectCountByCity,
    upcoming,
}: {
    cities: LandingListCity[];
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
}) {
    return (
        <>
            {cities.map((c) => (
                <MuniPanelCard
                    key={c.id}
                    city={c}
                    subjectCount={subjectCountByCity[c.id] ?? 0}
                    next={upcoming.find((m) => m.cityId === c.id)}
                />
            ))}
            <PetitionCta big source="municipalities_list" />
        </>
    );
}

/* δήμος card — stats + next meeting, links to the municipality page */
function MuniPanelCard({
    city,
    subjectCount,
    next,
}: {
    city: LandingListCity;
    subjectCount: number;
    next?: UpcomingMeeting;
}) {
    const t = useTranslations('landingV2');
    // The landing → municipality-page conversion; all three anchors of the card count.
    const trackOpen = () => captureLandingAction('city_opened', { city_id: city.id, source: 'municipalities_list' });
    return (
        <div className="group flex shrink-0 flex-col gap-3 rounded-2xl border border-black/40 bg-card p-4 shadow-sm transition-colors hover:border-black/60">
            <div className="flex items-center gap-2.5">
                <Link
                    href={`/${city.id}`}
                    onClick={trackOpen}
                    className="flex min-w-0 items-center gap-2.5 no-underline hover:no-underline"
                >
                    <CityAvatar city={city} />
                    <span className="min-w-0 text-lg font-bold tracking-tight text-foreground">{city.name}</span>
                </Link>
                {/* notifications bell — own anchor, sibling of the city link */}
                <Button
                    asChild
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 rounded-full bg-muted text-[hsl(var(--orange))] hover:bg-muted/80 hover:text-[hsl(var(--orange))]"
                >
                    <Link
                        href={`/${city.id}/notifications`}
                        aria-label={next ? t('municipality.notifyMeeting', { name: city.name }) : t('municipality.notify', { name: city.name })}
                        onClick={() => captureLandingAction('notify_cta', { surface: 'municipalities_list', city_id: city.id })}
                    >
                        <Bell className="h-3.5 w-3.5" />
                    </Link>
                </Button>
                {/* card → municipality page cue */}
                <Link
                    href={`/${city.id}`}
                    aria-label={city.name}
                    onClick={trackOpen}
                    className="ml-auto shrink-0 no-underline hover:no-underline"
                >
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
            </div>
            <Link href={`/${city.id}`} onClick={trackOpen} className="flex flex-col gap-3 no-underline hover:no-underline">
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
            </Link>
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
