'use client';

import { ArrowRight, Bell, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/formatters/time';
import type { LandingCity, UpcomingMeeting } from './landingData';
import { CityAvatar } from './controls';

/* The Δήμοι tab content — one card per municipality + a petition CTA. Shared by the
   desktop panel and the mobile sheet. */
export function MunicipalitiesList({
    cities,
    subjectCountByCity,
    upcoming,
}: {
    cities: LandingCity[];
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
            <PetitionCta big />
        </>
    );
}

/* δήμος card — stats + next meeting, links to the municipality page */
function MuniPanelCard({
    city,
    subjectCount,
    next,
}: {
    city: LandingCity;
    subjectCount: number;
    next?: UpcomingMeeting;
}) {
    const t = useTranslations('landingV2');
    return (
        <div className="group flex shrink-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-foreground/20">
            <div className="flex items-center gap-2.5">
                <Link
                    href={`/${city.id}`}
                    className="flex min-w-0 items-center gap-2.5 no-underline hover:no-underline"
                >
                    <CityAvatar city={city} />
                    <span className="min-w-0 text-lg font-bold tracking-tight text-foreground">{city.name}</span>
                </Link>
                {/* notifications — subtle round bell right after the name (light-gray circle,
                    no border). Own anchor (sibling of the city link). */}
                <Button
                    asChild
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 rounded-full bg-muted text-[hsl(var(--orange))] hover:bg-muted/80 hover:text-[hsl(var(--orange))]"
                >
                    <Link
                        href={`/${city.id}/notifications`}
                        aria-label={next ? t('municipality.notifyMeeting', { name: city.name }) : t('municipality.notify', { name: city.name })}
                    >
                        <Bell className="h-3.5 w-3.5" />
                    </Link>
                </Button>
                {/* card → municipality page cue with the hover slide, at the far right */}
                <Link
                    href={`/${city.id}`}
                    aria-label={city.name}
                    className="ml-auto shrink-0 no-underline hover:no-underline"
                >
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
            </div>
            <Link href={`/${city.id}`} className="flex flex-col gap-3 no-underline hover:no-underline">
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

/* petition CTA — closes the Δήμοι tab (`big`) and also surfaces in the search results
   when the visitor looks up a municipality we don't cover yet (`unknownName` tailors
   the copy). Links to the petition page either way. */
export function PetitionCta({ unknownName, big }: { unknownName?: string; big?: boolean }) {
    const t = useTranslations('landingV2');
    return (
        <Link
            href="/petition"
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
