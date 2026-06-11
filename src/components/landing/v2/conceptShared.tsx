'use client';

import Image from 'next/image';
import {
    MapPin,
    MessageSquare,
    Flame,
    Plus,
    Minus,
    Gavel,
    Link2,
    Layers,
    Globe,
    ArrowRight,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { CATEGORIES, municipalityOf, categoryList, type CategoryKey, type Topic } from './conceptData';

/** Active category filter value. */
export type CatValue = CategoryKey | 'all';

/* brand mark (app logo + wordmark) — `light` for use on dark surfaces */
export function BrandMark({ light, className }: { light?: boolean; className?: string }) {
    return (
        <Link href="/" className={cn('flex shrink-0 items-center gap-2', className)}>
            <Image src="/logo.png" alt="OpenCouncil" width={120} height={120} className="h-8 w-auto object-contain" priority />
            <span className={cn('hidden text-base font-bold tracking-tight sm:inline', light ? 'text-white' : 'text-foreground')}>
                Open<span className={light ? 'text-white' : 'text-primary'}>Council</span>
            </span>
        </Link>
    );
}

/* category chip */
export function CatChip({ cat, small }: { cat: CategoryKey; small?: boolean }) {
    const c = CATEGORIES[cat];
    const Icon = c.icon;
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
                small ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs',
            )}
            style={{ color: c.color, backgroundColor: `${c.color}1a`, borderColor: `${c.color}38` }}
        >
            <Icon className={small ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
            {small ? c.short : c.label}
        </span>
    );
}

/* "πολυσυζητημένο" hot tag */
export function HotTag({ count, suffix }: { count: number; suffix?: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--orange))]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[hsl(var(--orange))]">
            <Flame className="h-3 w-3" /> {count}
            {suffix ? ` ${suffix}` : ''}
        </span>
    );
}

/* meta row (location · date · count) */
export function MetaRow({ topic }: { topic: Topic }) {
    const m = municipalityOf(topic.muni);
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                <MapPin className="h-3 w-3" /> {m.name}
            </span>
            <span aria-hidden className="opacity-40">·</span>
            <span className="font-mono tabular-nums">{topic.date}</span>
            <span aria-hidden className="opacity-40">·</span>
            <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                <b className="font-mono tabular-nums text-foreground/80">{topic.count}</b> τοποθετήσεις
            </span>
        </div>
    );
}

/* category filter pills */
export function FilterBar({ value, onChange }: { value: CatValue; onChange: (v: CatValue) => void }) {
    return (
        <div className="flex w-max items-center gap-2">
            <FilterPill active={value === 'all'} onClick={() => onChange('all')}>
                Όλα
            </FilterPill>
            {categoryList.map((c) => {
                const Icon = c.icon;
                return (
                    <FilterPill key={c.key} active={value === c.key} onClick={() => onChange(c.key)}>
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: c.color }} />
                        {c.short}
                    </FilterPill>
                );
            })}
        </div>
    );
}

export function FilterPill({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors',
                active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground/30',
            )}
        >
            {children}
        </button>
    );
}

/* single map control button */
export function ControlButton({
    onClick,
    label,
    children,
    accent,
    flush,
}: {
    onClick: () => void;
    label: string;
    children: React.ReactNode;
    accent?: boolean;
    flush?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={cn(
                'flex h-10 w-10 items-center justify-center bg-card/95 backdrop-blur transition-colors hover:bg-muted',
                flush ? 'text-foreground/70' : 'rounded-xl border border-border shadow-md',
                accent && 'text-primary',
            )}
        >
            {children}
        </button>
    );
}

/* compact topic card (color bar + chip + title + meta) — rails, sheets, map peeks */
export function CompactTopicCard({
    topic,
    selected,
    onClick,
}: {
    topic: Topic;
    selected?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex shrink-0 overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-colors',
                selected ? 'border-primary ring-2 ring-primary/15' : 'border-border hover:border-foreground/20',
            )}
        >
            <span className="w-1 shrink-0" style={{ backgroundColor: CATEGORIES[topic.cat].color }} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3">
                <span className="flex items-center gap-2">
                    <CatChip cat={topic.cat} small />
                    {topic.hot && <HotTag count={topic.count} />}
                </span>
                <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{topic.title}</span>
                <MetaRow topic={topic} />
            </span>
        </button>
    );
}

/* "Με ψηφοφορία" badge (Subject went to a vote / has a Decision) */
export function VoteBadge() {
    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-foreground/70">
            <Gavel className="h-3 w-3" /> Με ψηφοφορία
        </span>
    );
}

/* relates-to / discussed-with / external context */
export function SubjectExtras({ topic }: { topic: Topic }) {
    if (!topic.relatedTo && !topic.discussedIn && !topic.context) return null;
    return (
        <div className="flex flex-col gap-2">
            {topic.relatedTo && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        <span className="font-medium text-foreground/70">Σχετίζεται με:</span> {topic.relatedTo}
                    </span>
                </div>
            )}
            {topic.discussedIn && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        <span className="font-medium text-foreground/70">Συζητήθηκε μαζί με:</span> {topic.discussedIn}
                    </span>
                </div>
            )}
            {topic.context && (
                <div className="rounded-lg border border-border bg-muted/50 p-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Globe className="h-3 w-3" /> Πλαίσιο · από το διαδίκτυο
                    </div>
                    <p className="text-xs leading-relaxed text-foreground/70">{topic.context}</p>
                </div>
            )}
        </div>
    );
}

/* link to the subject's own page */
export function SubjectPageLink({ href, className }: { href: string; className?: string }) {
    return (
        <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className={cn(
                'inline-flex items-center gap-1 text-[13px] font-semibold text-[hsl(var(--orange))] hover:underline',
                className,
            )}
        >
            Δες τη σελίδα του θέματος <ArrowRight className="h-3.5 w-3.5" />
        </Link>
    );
}

/* editorial topic card (photo on hot topics) — used by the desktop panel list */
export function EditorialCard({
    topic,
    onClick,
    selected,
}: {
    topic: Topic;
    onClick?: () => void;
    selected?: boolean;
}) {
    const clickable = !!onClick;
    return (
        <div
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={onClick}
            onKeyDown={
                clickable
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onClick?.();
                          }
                      }
                    : undefined
            }
            className={cn(
                'flex flex-col gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors',
                clickable && 'cursor-pointer',
                selected ? 'border-primary ring-2 ring-primary/15' : 'border-border hover:border-foreground/20',
            )}
        >
            {topic.hot && (
                <div className="relative h-32 overflow-hidden rounded-lg bg-muted">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_10px,hsl(var(--background))_10px_20px)]" />
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--orange))] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        <Flame className="h-3 w-3" /> Πολυσυζητημένο
                    </span>
                    <span className="absolute bottom-1.5 left-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        φωτό θέματος — {CATEGORIES[topic.cat].short}
                    </span>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <CatChip cat={topic.cat} />
                {topic.hasVote && <VoteBadge />}
            </div>
            <h3 className="text-balance text-lg font-bold leading-snug tracking-tight text-foreground">{topic.title}</h3>
            <p className="text-sm leading-relaxed text-foreground/70">{topic.summary}</p>
            <SubjectExtras topic={topic} />
            <div className="h-px bg-border" />
            <MetaRow topic={topic} />
            <SubjectPageLink href={topic.href} />
        </div>
    );
}

/* zoom +/- group */
export function ZoomGroup({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
    return (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border shadow-md">
            <ControlButton onClick={onZoomIn} label="Μεγέθυνση" flush>
                <Plus className="h-4 w-4" />
            </ControlButton>
            <div className="h-px bg-border" />
            <ControlButton onClick={onZoomOut} label="Σμίκρυνση" flush>
                <Minus className="h-4 w-4" />
            </ControlButton>
        </div>
    );
}