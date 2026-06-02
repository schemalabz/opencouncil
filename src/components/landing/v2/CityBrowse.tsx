'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Clock, Users, Building2, Plus } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import Icon from '@/components/icon';
import { cityCards, type CityCard as CityCardData } from './mockData';
import { TopicChipBadge } from './shared';

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
                <div>
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
        <div className="group flex min-h-[460px] flex-col overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
                        {city.name.replace(/^Δήμος\s+/, '').charAt(0)}
                    </div>
                    <Link href={city.href} className="font-semibold hover:underline">
                        {city.name}
                    </Link>
                </div>
                <TopicChipBadge topic={city.topTopic} />
            </div>

            {/* Stats — fill the central area, not clickable */}
            <div className="grid flex-1 grid-cols-2 gap-px bg-border">
                <CityStat icon={<Clock className="h-5 w-5" />} value={`${city.stats.hours}ω`} label="συζητήσεων" />
                <CityStat icon={<CalendarDays className="h-5 w-5" />} value={city.stats.meetings} label="συνεδριάσεις" />
                <CityStat icon={<Users className="h-5 w-5" />} value={city.stats.persons} label="πρόσωπα" />
                <CityStat icon={<Building2 className="h-5 w-5" />} value={city.stats.parties} label="παρατάξεις" />
            </div>

            {/* Recent hot subjects — as gray pills */}
            <div className="border-t border-border p-5">
                <p className="pb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Πρόσφατα πολυσυζητημένα
                </p>
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
