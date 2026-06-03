'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Clock, Users, Building2, Plus, Bell, CalendarClock } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import Icon from '@/components/icon';
import { cn } from '@/lib/utils';
import { cityCards, type CityCard as CityCardData } from './mockData';
import { TopicChipBadge, Eyebrow } from './shared';
import { NotifyDialog } from './NotifyDialog';

const shortName = (name: string) => name.replace(/^Δήμος\s+/, '');

/** Deterministic sparkbar heights (0..1) from a seed string — last bar is "hot". */
function makeBars(seed: string, n = 14): number[] {
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
        h = (h * 1103515245 + 12345) >>> 0;
        out.push(0.25 + ((h % 1000) / 1000) * 0.75);
    }
    return out;
}

// How many cities to show initially, and how many more each "view more" reveals.
const INITIAL_VISIBLE = 6;
const STEP = 3;

/**
 * "Ποιος δήμος σας ενδιαφέρει;" — per-city cards shown in random order each load.
 * Per the issue decision, stats stay prominent, but they're now real links and
 * the card leads with recent hot subjects so it isn't merely decorative.
 */
export function CityBrowse() {
    const [visible, setVisible] = useState(INITIAL_VISIBLE);
    const shown = cityCards.slice(0, visible);
    const remaining = cityCards.length - visible;

    return (
        <section className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1.5">
                    <Eyebrow>Εξερεύνηση</Eyebrow>
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ποιος δήμος σε ενδιαφέρει;</h2>
                    <p className="mt-2 text-muted-foreground">Εμφανίζονται με τυχαία σειρά κάθε φορά.</p>
                </div>
                <Link
                    href="/map"
                    className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    Δείτε τους όλους
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {shown.map((city) => (
                    <CityCard key={city.id} city={city} />
                ))}
            </div>

            {remaining > 0 && (
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={() => setVisible((v) => v + STEP)}
                        className="rounded-full"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Δείτε περισσότερους δήμους
                    </Button>
                </div>
            )}
        </section>
    );
}

function CityCard({ city }: { city: CityCardData }) {
    return (
        <div className="group flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
                        {shortName(city.name).charAt(0)}
                    </div>
                    <div>
                        <Link href={city.href} className="block font-semibold leading-tight hover:underline">
                            {city.name}
                        </Link>
                        <span className="text-xs font-medium text-muted-foreground">{city.region}</span>
                    </div>
                </div>
                <TopicChipBadge topic={city.topTopic} />
            </div>

            {/* Stats — not clickable */}
            <div className="grid grid-cols-2 gap-px bg-border">
                <CityStat icon={<Clock className="h-5 w-5" />} value={`${city.stats.hours}ω`} label="συζητήσεων" />
                <CityStat icon={<CalendarDays className="h-5 w-5" />} value={city.stats.meetings} label="συνεδριάσεις" />
                <CityStat icon={<Users className="h-5 w-5" />} value={city.stats.persons} label="πρόσωπα" />
                <CityStat icon={<Building2 className="h-5 w-5" />} value={city.stats.parties} label="παρατάξεις" />
            </div>

            {/* Activity sparkbars */}
            <div className="flex h-9 items-end gap-[3px] px-5 pt-4">
                {makeBars(city.id).map((v, i, arr) => (
                    <span
                        key={i}
                        className={cn('flex-1 rounded-sm', i === arr.length - 1 ? 'bg-[hsl(var(--orange))]' : 'bg-muted')}
                        style={{ height: `${Math.max(14, v * 100)}%` }}
                    />
                ))}
            </div>

            {/* Recent hot subjects — gray rows with topic icons */}
            <div className="px-5 pt-4">
                <Eyebrow className="mb-2.5 block">Πρόσφατα πολυσυζητημένα</Eyebrow>
                <div className="flex flex-col gap-2">
                    {city.recentSubjects.map((s, i) => (
                        <Link
                            key={i}
                            href={s.href}
                            className="flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/70"
                        >
                            <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                                style={{ backgroundColor: `${s.topic.colorHex}1a` }}
                            >
                                <Icon name={s.topic.icon || 'hash'} color={s.topic.colorHex} size={14} />
                            </span>
                            <span className="truncate">{s.title}</span>
                            <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </Link>
                    ))}
                </div>
            </div>

            {/* Footer: next meeting + follow */}
            <div className="mt-auto flex items-center justify-between gap-2 p-5 pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {city.nextMeeting}
                </span>
                <NotifyDialog muniName={shortName(city.name)}>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--orange))]/10 px-3 py-1.5 text-xs font-bold text-[#c2470a] transition-colors hover:bg-[hsl(var(--orange))]/20"
                    >
                        <Bell className="h-3.5 w-3.5" />
                        Ακολούθησε
                    </button>
                </NotifyDialog>
            </div>
        </div>
    );
}

function CityStat({
    icon,
    value,
    label,
}: {
    icon: React.ReactNode;
    value: React.ReactNode;
    label: string;
}) {
    return (
        <div className="flex flex-col justify-center gap-1.5 bg-card p-5">
            <span className="text-muted-foreground">{icon}</span>
            <span className="text-2xl font-bold leading-none">{value}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
    );
}
