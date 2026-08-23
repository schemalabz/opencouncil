'use client';

import { ArrowLeft, ArrowRight, X, Plus, Minus, Flame, Info, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { Topic } from '@prisma/client';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { captureLandingAction } from '@/lib/landing/analytics';
import { type SubjectTopic } from '@/lib/landing/landingData';
import { topicStyle } from '@/lib/topicStyle';


/* topic chip (icon + name in the topic's accent color); `iconOnly` drops the label */
export function TopicChip({ topic, small, iconOnly }: { topic: SubjectTopic; small?: boolean; iconOnly?: boolean }) {
    const style = topicStyle(topic.color);
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-bold',
                iconOnly
                    ? (small ? 'p-1' : 'p-1.5')
                    : (small ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'),
            )}
            style={{ color: style.icon, backgroundColor: style.background, borderColor: style.border }}
        >
            <Icon name={topic.icon || 'hash'} color={style.icon} size={small ? 12 : 14} />
            {!iconOnly && topic.name}
        </span>
    );
}

/* "Πρόσφατα πολυσυζητημένα" — names the subject list's ordering and explains it on demand.
   A Popover rather than a tooltip so the ⓘ works on tap (mobile) as well as hover-less desktops.
   `floating` wraps it as a self-contained pill for sitting over the map (mobile strip); without
   it, it renders as a plain inline row for the desktop panel header. */
export function RankedListHint({
    floating,
    searchQuery,
    searchHref,
}: {
    floating?: boolean;
    searchQuery?: string;
    /** /search?q=… carrying the committed query and filters — adds a handoff row to the popover */
    searchHref?: string;
}) {
    const t = useTranslations('landingV2');
    // A committed search re-orders the list by how well each subject answers it,
    // so the ordering has to say which question it is answering. Without the
    // query the caption describes the map's own ranking instead.
    const title = searchQuery ? t('list.relevanceTitle', { query: searchQuery }) : t('list.rankedTitle');
    const explain = searchQuery ? t('list.relevanceExplain', { query: searchQuery }) : t('list.rankedExplain');
    // The flame means hottest and most recent, which is the map's own ranking.
    // A search orders by relevance instead, so it gets its own glyph — sharing
    // the flame would make the two orderings indistinguishable at a glance,
    // which is the one thing this caption exists to prevent.
    const OrderingIcon = searchQuery ? Search : Flame;
    return (
        <Popover onOpenChange={(open) => open && captureLandingAction('ranking_explain_opened', {})}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground',
                        floating && 'rounded-full border border-border bg-card/95 px-3 py-1.5 shadow-md backdrop-blur',
                    )}
                >
                    <OrderingIcon className="h-3.5 w-3.5 text-[hsl(var(--orange))]" aria-hidden />
                    {title}
                    <Info className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side={floating ? 'top' : 'bottom'}
                align="start"
                className="w-72 rounded-xl border-border p-3 text-xs leading-relaxed text-muted-foreground shadow-lg"
            >
                {explain}
                {/* The explanation says the results stop at the map's edge — this is the
                    reader who just learned that, so the way past the edge goes here. */}
                {searchQuery && searchHref && (
                    <Link
                        href={searchHref}
                        onClick={() => captureLandingAction('search_handoff', { query_length: searchQuery.length, surface: 'explainer' })}
                        className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 font-semibold text-foreground no-underline transition-colors hover:text-[hsl(var(--orange))] hover:no-underline"
                    >
                        {t('search.everywhere')}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                )}
            </PopoverContent>
        </Popover>
    );
}

/* Shared list-panel header — bold title + count. `onBack` adds a back arrow; `trailing` slots a
   right-side control; `onToggle` makes the whole row a button with a ▼ (the mobile collapse tab). */
export function ListHeader({
    title,
    count,
    onBack,
    backLabel,
    trailing,
    onToggle,
    tone = 'default',
    className,
}: {
    title: string;
    /** shown in parentheses next to the title; omit for no count */
    count?: number;
    /** when set, renders a back arrow that calls this */
    onBack?: () => void;
    backLabel?: string;
    trailing?: React.ReactNode;
    /** when set, the whole header row becomes a button that calls this (closes the panel),
     *  rendering an × on the right; takes precedence over `trailing`. */
    onToggle?: () => void;
    /** 'brand' switches to light text, for sitting over an intense gradient / dark fill */
    tone?: 'default' | 'brand';
    /** extra classes on the header row (e.g. the gradient background) */
    className?: string;
}) {
    const t = useTranslations('landingV2');
    const brand = tone === 'brand';
    const rowClass = cn('flex shrink-0 items-center justify-between gap-2 px-4 py-3', className);
    const inner = (
        <>
            <div className="flex min-w-0 items-center gap-1.5">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={backLabel ?? t('common.back')}
                        className={cn(
                            '-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                            brand
                                ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                        )}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                )}
                <h2 className={cn('truncate text-left text-xl font-bold tracking-tight', brand ? 'text-foreground' : 'text-foreground')}>
                    {title}
                    {count != null && (
                        <span
                            className={cn(
                                'ml-1.5 align-baseline font-mono text-xl font-semibold tabular-nums',
                                brand ? 'text-muted-foreground' : 'text-muted-foreground',
                            )}
                        >
                            ({count})
                        </span>
                    )}
                </h2>
            </div>
            {onToggle ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground">
                    <X className="h-5 w-5" />
                </span>
            ) : (
                trailing
            )}
        </>
    );
    // With `onToggle` the whole row is a button (mobile); otherwise a plain row (desktop puts its
    // control in `trailing`).
    return onToggle ? (
        <button
            type="button"
            onClick={onToggle}
            aria-label={t('common.close')}
            className={cn(rowClass, 'w-full text-left transition-colors hover:bg-background/40')}
        >
            {inner}
        </button>
    ) : (
        <div className={rowClass}>{inner}</div>
    );
}

/* topic filter pills */
export function FilterBar({
    topics,
    selected,
    onToggle,
    onClear,
}: {
    topics: Topic[];
    /** selected topic ids — empty means "all" */
    selected: string[];
    onToggle: (id: string) => void;
    onClear: () => void;
}) {
    const t = useTranslations('landingV2');
    return (
        <div className="flex w-max items-center gap-2">
            <FilterPill active={selected.length === 0} onClick={onClear}>
                {t('filters.all')}
            </FilterPill>
            {topics.map((t) => {
                const active = selected.includes(t.id);
                return (
                    <FilterPill key={t.id} active={active} color={t.colorHex} onClick={() => onToggle(t.id)}>
                        <Icon name={t.icon || 'hash'} color={topicStyle(t.colorHex, active ? 'solid' : 'soft').icon} size={14} />
                        {t.name}
                    </FilterPill>
                );
            })}
        </div>
    );
}

export function FilterPill({
    active,
    onClick,
    color,
    children,
}: {
    active: boolean;
    onClick: () => void;
    /** topic accent — soft tint when idle, filled when active. Omit for the neutral "Όλα" pill. */
    color?: string;
    children: React.ReactNode;
}) {
    // Topic pills: the shared topic recipe — soft wash when idle, solid fill when selected.
    const style = color ? topicStyle(color, active ? 'solid' : 'soft') : null;
    const colorStyle = style
        ? { backgroundColor: style.background, borderColor: style.border, color: style.icon }
        : undefined;
    return (
        <button
            type="button"
            onClick={onClick}
            style={colorStyle}
            className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-bold transition-colors',
                !color &&
                (active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground/30'),
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

/* zoom +/- group */
export function ZoomGroup({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
    const t = useTranslations('landingV2');
    return (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border shadow-md">
            <ControlButton onClick={onZoomIn} label={t('map.zoomIn')} flush>
                <Plus className="h-4 w-4" />
            </ControlButton>
            <div className="h-px bg-border" />
            <ControlButton onClick={onZoomOut} label={t('map.zoomOut')} flush>
                <Minus className="h-4 w-4" />
            </ControlButton>
        </div>
    );
}
