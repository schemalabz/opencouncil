import { ArrowUpRight, TrendingUp, CalendarClock, Bell } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { trendingSubjects, upcomingMeetings } from './mockData';
import { TopicChipBadge, formatMeetingDate, LiveDot } from './shared';
import { HeroCarousel } from './HeroCarousel';
import { NotifyDialog } from './NotifyDialog';

/**
 * Hero as a bento (à la the Atacama reference): the brand carousel beside a
 * stack of live-activity cards — the cross-city "hot" feed and upcoming meetings.
 * This is the hook + the primary action (click a subject), above the fold.
 */
export function HeroBento() {
    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <HeroCarousel />
            <div className="flex flex-col gap-4 lg:col-span-5">
                <TrendingCard />
                <UpcomingCard />
            </div>
        </div>
    );
}

function TrendingCard() {
    return (
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <header className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--orange))]/10 text-[hsl(var(--orange))]">
                        <TrendingUp className="h-4 w-4" />
                    </span>
                    <h2 className="text-lg font-semibold">Συζητιούνται τώρα</h2>
                </div>
                <LiveDot label="Live" />
            </header>
            <ul className="space-y-1">
                {trendingSubjects.slice(0, 4).map((s) => (
                    <li key={s.id}>
                        <Link
                            href={s.href}
                            className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted"
                        >
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="line-clamp-2 text-sm font-medium leading-snug">{s.title}</p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                    <TopicChipBadge topic={s.topic} />
                                    <span>{s.cityName}</span>
                                    <span aria-hidden>·</span>
                                    <span>{s.statLabel}</span>
                                </div>
                            </div>
                            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function UpcomingCard() {
    return (
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <header className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
                    <CalendarClock className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-semibold">Επόμενες συνεδριάσεις</h2>
            </header>
            <ul className="space-y-2">
                {upcomingMeetings.slice(0, 3).map((m) => {
                    const { date, time } = formatMeetingDate(m.dateISO);
                    return (
                        <li key={m.id}>
                            <Link
                                href={m.href}
                                className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted"
                            >
                                <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-muted px-2 py-1.5 text-center group-hover:bg-background">
                                    <span className="text-xs font-semibold uppercase">{date}</span>
                                    <span className="text-xs text-muted-foreground">{time}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{m.cityName}</p>
                                    <p className="truncate text-xs text-muted-foreground">{m.adminBodyName}</p>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <NotifyDialog>
                <button
                    type="button"
                    className={cn(
                        'mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-border py-2 text-sm font-medium',
                        'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    )}
                >
                    <Bell className="h-4 w-4" />
                    Ειδοποίησέ με για τα θέματά μου
                </button>
            </NotifyDialog>
        </section>
    );
}
