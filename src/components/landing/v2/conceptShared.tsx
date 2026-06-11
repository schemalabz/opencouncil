'use client';

import Image from 'next/image';
import { MapPin, Flame, Plus, Minus, Clock, ArrowRight, Users } from 'lucide-react';
import type { Topic } from '@prisma/client';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { formatDate } from '@/lib/formatters/time';
import { type LandingSubject, type SubjectTopic } from './landingData';

/** Active topic filter value — a Topic id or 'all'. */
export type CatValue = string;

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

/* topic chip (icon + name in the topic's accent color) */
export function TopicChip({ topic, small }: { topic: SubjectTopic; small?: boolean }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
                small ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs',
            )}
            style={{ color: topic.color, backgroundColor: `${topic.color}1a`, borderColor: `${topic.color}38` }}
        >
            <Icon name={topic.icon || 'hash'} color={topic.color} size={small ? 12 : 14} />
            {topic.name}
        </span>
    );
}

/* "πολυσυζητημένο" hot tag */
export function HotTag() {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--orange))]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[hsl(var(--orange))]">
            <Flame className="h-3 w-3" /> Πολυσυζητημένο
        </span>
    );
}

/* meta row (municipality · meeting date · speakers) */
export function MetaRow({ subject }: { subject: LandingSubject }) {
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                <MapPin className="h-3 w-3" /> {subject.cityName}
            </span>
            {subject.date && (
                <>
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="font-mono tabular-nums">{formatDate(new Date(subject.date))}</span>
                </>
            )}
            {subject.speakers > 0 && (
                <>
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <b className="font-mono tabular-nums text-foreground/80">{subject.speakers}</b> ομιλητές
                    </span>
                </>
            )}
        </div>
    );
}

/* topic filter pills */
export function FilterBar({
    topics,
    value,
    onChange,
}: {
    topics: Topic[];
    value: CatValue;
    onChange: (v: CatValue) => void;
}) {
    return (
        <div className="flex w-max items-center gap-2">
            <FilterPill active={value === 'all'} onClick={() => onChange('all')}>
                Όλα
            </FilterPill>
            {topics.map((t) => (
                <FilterPill key={t.id} active={value === t.id} onClick={() => onChange(t.id)}>
                    <Icon name={t.icon || 'hash'} color={t.colorHex} size={14} />
                    {t.name}
                </FilterPill>
            ))}
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

/* compact subject card (color bar + chip + title + meta) — rails, sheets, map peeks */
export function CompactTopicCard({
    subject,
    selected,
    onClick,
}: {
    subject: LandingSubject;
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
            <span className="w-1 shrink-0" style={{ backgroundColor: subject.topic.color }} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3">
                <span className="flex items-center gap-2">
                    <TopicChip topic={subject.topic} small />
                    {subject.hot && <HotTag />}
                </span>
                <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{subject.title}</span>
                <MetaRow subject={subject} />
            </span>
        </button>
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

/* editorial subject card — used by the desktop panel list */
export function EditorialCard({
    subject,
    onClick,
    selected,
}: {
    subject: LandingSubject;
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
            <div className="flex flex-wrap items-center gap-2">
                <TopicChip topic={subject.topic} />
                {subject.hot && <HotTag />}
            </div>
            <h3 className="text-balance text-lg font-bold leading-snug tracking-tight text-foreground">{subject.title}</h3>
            {subject.summary && <p className="text-sm leading-relaxed text-foreground/70">{subject.summary}</p>}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {subject.where && (
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                        <MapPin className="h-3 w-3" /> {subject.where}
                    </span>
                )}
                {subject.durationMin > 0 && (
                    <>
                        {subject.where && <span aria-hidden className="opacity-40">·</span>}
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {subject.durationMin}′ συζήτηση
                        </span>
                    </>
                )}
            </div>
            <div className="h-px bg-border" />
            <MetaRow subject={subject} />
            <SubjectPageLink href={subject.href} />
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
