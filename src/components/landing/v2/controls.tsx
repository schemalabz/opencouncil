'use client';

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
    Search,
    CalendarDays,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    Check,
    Filter,
    Layers,
    LayoutList,
    Landmark,
    ArrowRight,
    HelpCircle,
    X,
    type LucideIcon,
} from 'lucide-react';
import type { Topic } from '@prisma/client';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { env } from '@/env.mjs';
import { captureLandingAction } from '@/lib/landing/analytics';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FilterBar } from './conceptShared';
import {
    canWidenRange,
    DATE_RANGES,
    EMPTY_FILTERS,
    hasActiveFilters,
    widenRange,
    type DateRangeKey,
    type DisplayedMunicipality,
    type MapFilters,
    SEARCH_FIELD_STYLE,
} from '@/lib/landing/landingCore';
import type { LandingListCity } from '@/lib/landing/landingData';

/* date-range dropdown — badge-style pill, same look as the topic filter pills */
export function DateRangePill({ value, onChange }: { value: DateRangeKey; onChange: (v: DateRangeKey) => void }) {
    const t = useTranslations('landingV2');
    const current = DATE_RANGES.find((r) => r.key === value) ?? DATE_RANGES[0];
    const [open, setOpen] = useState(false);
    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-black/40 bg-card px-3 text-[13px] font-medium text-muted-foreground shadow-sm transition-colors hover:border-black/60"
                >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {t(`dateRange.${current.key}`)}
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" collisionPadding={12} className="rounded-2xl p-1.5">
                {DATE_RANGES.map((r) => (
                    <DropdownMenuItem
                        key={r.key}
                        onSelect={() => onChange(r.key)}
                        className={cn('gap-2 rounded-lg py-2', r.key === value && 'font-semibold')}
                    >
                        <Check className={cn('h-4 w-4', r.key === value ? 'opacity-100' : 'opacity-0')} />
                        {t(`dateRangeMenu.${r.key}`)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/* filters toggle — icon button with an active dot; opens the search dropdown/overlay */
export function FilterIconButton({
    active,
    onClick,
    compact,
    ariaLabel,
}: {
    active: boolean;
    onClick: () => void;
    compact?: boolean;
    /** overrides the default (landing map) label — other callers reusing this button aren't in the landingV2 namespace */
    ariaLabel?: string;
}) {
    const t = useTranslations('landingV2');
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel ?? t('map.filters')}
            className={cn(
                'relative inline-flex shrink-0 items-center justify-center rounded-full border bg-card transition-colors',
                compact ? 'h-8 w-8 shadow-md' : 'h-11 w-11 shadow-lg',
                // active filter matches the active search box: orange border/tint/text, with an orange dot
                active
                    ? 'border-[hsl(var(--orange))] bg-[hsl(24,100%,96%)] text-[hsl(var(--orange))]'
                    : 'border-border text-muted-foreground hover:border-foreground/30',
            )}
        >
            <Filter className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            {active && (
                <span className="absolute right-[2px] top-[2px] h-1.5 w-1.5 rounded-full bg-[hsl(var(--orange))]" />
            )}
        </button>
    );
}

/* horizontally scrollable category filter row with arrows on overflow.
   `leading` renders fixed controls (e.g. filters icon + date pill) ahead of the pills. */
export function CategoryFilterBar({
    topics,
    selected,
    onToggle,
    onClear,
    leading,
}: {
    topics: Topic[];
    selected: string[];
    onToggle: (id: string) => void;
    onClear: () => void;
    leading?: ReactNode;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canLeft, setCanLeft] = useState(false);
    const [canRight, setCanRight] = useState(false);

    const updateArrows = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanLeft(el.scrollLeft > 4);
        setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        updateArrows();
        const ro = new ResizeObserver(updateArrows);
        ro.observe(el);
        el.addEventListener('scroll', updateArrows, { passive: true });
        return () => {
            ro.disconnect();
            el.removeEventListener('scroll', updateArrows);
        };
        // `leading` is in here because mounting the search chip widens the row
        // without resizing the scroller, so the observer never fires: the arrow
        // and the fade would stay hidden and the trailing pills would sit clipped
        // flat against the edge with nothing to say they can be scrolled to.
    }, [updateArrows, topics, leading]);

    const scrollByDir = (dir: 1 | -1) => scrollRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });

    // Fade to transparent at whichever edge can still scroll, so chips dissolve under the arrow.
    const FADE = 40;
    const maskImage =
        canLeft && canRight
            ? `linear-gradient(to right, transparent, #000 ${FADE}px, #000 calc(100% - ${FADE}px), transparent)`
            : canRight
              ? `linear-gradient(to right, #000 calc(100% - ${FADE}px), transparent)`
              : canLeft
                ? `linear-gradient(to right, transparent, #000 ${FADE}px)`
                : undefined;

    return (
        <div className="relative">
            <div
                ref={scrollRef}
                className="overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [&_button]:shadow-md"
                style={{ scrollbarWidth: 'none', maskImage, WebkitMaskImage: maskImage }}
            >
                <div className="flex w-max items-center gap-2">
                    {leading}
                    <FilterBar topics={topics} selected={selected} onToggle={onToggle} onClear={onClear} />
                </div>
            </div>
            {canLeft && <ScrollArrow dir="left" onClick={() => scrollByDir(-1)} />}
            {canRight && <ScrollArrow dir="right" onClick={() => scrollByDir(1)} />}
        </div>
    );
}

/* edge arrow for the scrollable category row (sits over a fade to the background) */
function ScrollArrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
    const t = useTranslations('landingV2');
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={dir === 'left' ? t('map.prevCategories') : t('map.nextCategories')}
            className={cn(
                'absolute top-1/2 z-[2] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-muted',
                dir === 'left' ? '-left-1' : '-right-1',
            )}
        >
            {dir === 'left' ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
    );
}

/* basemap toggle — shows the mode you can switch to (satellite ⟷ απλός χάρτης).
   `iconOnly` drops the label (used on mobile, where space is tight). */
export function MapStyleToggle({
    satellite,
    onToggle,
    iconOnly,
}: {
    satellite: boolean;
    onToggle: () => void;
    iconOnly?: boolean;
}) {
    const t = useTranslations('landingV2');
    // Offering satellite → satellite-imagery backdrop (dark overlay for legibility); in
    // satellite mode → plain card style.
    const satBg = `linear-gradient(rgba(12,18,32,0.45), rgba(12,18,32,0.55)), url("https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/23.74,37.99,9.5/200x44@2x?attribution=false&logo=false&access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}")`;
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={satellite ? t('map.plainMap') : t('map.satelliteView')}
            style={
                satellite
                    ? undefined
                    : { backgroundImage: satBg, backgroundSize: 'cover', backgroundPosition: 'center' }
            }
            className={cn(
                'inline-flex h-10 items-center rounded-xl border text-[13px] font-semibold shadow-md backdrop-blur transition-all',
                iconOnly ? 'w-10 justify-center' : 'gap-2 px-3',
                satellite
                    ? 'border-border bg-card/95 text-foreground hover:bg-muted'
                    : 'border-white/20 text-white hover:brightness-110',
            )}
        >
            <Layers className="h-4 w-4" />
            {!iconOnly && (satellite ? t('map.plainMap') : t('map.satellite'))}
        </button>
    );
}

/* city avatar — logo when available, first letter otherwise */
export function CityAvatar({ city, size = 9 }: { city: { name: string; logoImage: string | null }; size?: number }) {
    if (city.logoImage) {
        return (
            <span className={`relative h-${size} w-${size} flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card`}>
                <Image src={city.logoImage} alt={city.name} width={36} height={36} className="h-full w-full object-contain" />
            </span>
        );
    }
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            {city.name[0]}
        </span>
    );
}

/* A δήμος's numbers on one line — bold figures, quiet words ("112 θέματα · 11 συνεδριάσεις ·
   148 πρόσωπα"). Shared by the δήμος bar and the δήμος cards, so the two never disagree. Rendered
   into a muted-text parent; the figures step up to the foreground colour. */
export function MunicipalityStats({ subjects, meetings, persons }: { subjects: number; meetings: number; persons: number }) {
    const t = useTranslations('landingV2');
    return (
        <>
            {t.rich('municipality.stats', {
                subjects,
                meetings,
                persons,
                n: (chunks) => <span className="font-semibold tabular-nums text-foreground">{chunks}</span>,
            })}
        </>
    );
}

/* The way into the δήμος the map is about — a bar along the bottom of the map, on every view and
   both layouts. Logo, the full "Δήμος X" name, its numbers when the list has them, and an orange
   call-to-action; the whole bar is the link. `compact` is the phone layout: tighter, with the
   call-to-action reduced to its arrow so the name and the numbers keep the width. */
export function MunicipalityBar({
    municipality,
    cities,
    subjectCountByCity,
    compact,
    className,
}: {
    municipality: DisplayedMunicipality;
    /** the listed δήμοι, for the bar's numbers (meetings, people) */
    cities: LandingListCity[];
    /** unfiltered total subjects per cityId, for the bar's numbers */
    subjectCountByCity: Record<string, number>;
    compact?: boolean;
    className?: string;
}) {
    const t = useTranslations('landingV2');
    const listed = cities.find((c) => c.id === municipality.id);
    const logo = municipality.logoImage ?? listed?.logoImage ?? null;
    return (
        <Link
            href={`/${municipality.id}`}
            prefetch={false}
            onClick={() => captureLandingAction('city_opened', { city_id: municipality.id, source: 'page_button' })}
            className={cn(
                'group flex w-full items-center rounded-2xl border-2 border-[hsl(var(--orange))] bg-card no-underline shadow-lg transition-colors hover:bg-[hsl(24,100%,97%)] hover:no-underline',
                compact ? 'h-12 gap-2.5 px-1.5' : 'h-14 gap-3 px-2',
                className,
            )}
        >
            <span
                className={cn(
                    'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card',
                    compact ? 'h-9 w-9' : 'h-10 w-10',
                )}
            >
                {logo ? (
                    <Image src={logo} alt="" width={40} height={40} className="h-full w-full object-contain" />
                ) : (
                    <Landmark className={cn('text-[hsl(var(--orange))]', compact ? 'h-5 w-5' : 'h-6 w-6')} />
                )}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
                <span className={cn('block truncate font-bold text-foreground', compact ? 'text-sm' : 'text-[15px]')}>
                    {municipality.nameMunicipality}
                </span>
                {listed && (
                    <span className="block truncate text-xs text-muted-foreground">
                        <MunicipalityStats
                            subjects={subjectCountByCity[municipality.id] ?? 0}
                            meetings={listed._count.councilMeetings}
                            persons={listed._count.persons}
                        />
                    </span>
                )}
            </span>
            <span
                className={cn(
                    'inline-flex shrink-0 items-center justify-center gap-1.5 bg-[hsl(var(--orange))] font-semibold text-white shadow-sm transition group-hover:brightness-95',
                    compact ? 'h-9 w-9 rounded-full' : 'h-10 rounded-xl px-4 text-sm',
                )}
            >
                {!compact && t('municipality.openPage')}
                <ArrowRight className="h-4 w-4 shrink-0" />
            </span>
        </Link>
    );
}

/* "few results" hint at the foot of the subject list (≤ 3 in view). Suggests the next step:
   - only a municipality selected → widen the time range;
   - any other narrowing active → clear the filters;
   - nothing active → zoom the map out. */
export function FewResultsHint({
    loading,
    count,
    cats,
    onClearCats,
    query,
    setQuery,
    filters,
    setFilters,
    range,
    setRange,
    onZoomOut,
}: {
    loading: boolean;
    count: number;
    cats: string[];
    onClearCats: () => void;
    query: string;
    setQuery: (v: string) => void;
    filters: MapFilters;
    setFilters: (v: MapFilters) => void;
    range: DateRangeKey;
    setRange: (v: DateRangeKey) => void;
    onZoomOut: () => void;
}) {
    const t = useTranslations('landingV2');
    if (loading || count > 3) return null;

    // Only a δήμος is chosen — no category, text, body-type or explicit-date narrowing.
    const onlyMunicipality =
        filters.cityIds.length > 0 &&
        filters.bodyTypes.length === 0 &&
        !filters.dateFrom &&
        !filters.dateTo &&
        filters.minDuration == null &&
        cats.length === 0 &&
        query.trim() === '';
    const otherFiltersActive = hasActiveFilters(filters) || cats.length > 0 || query.trim() !== '';

    let label: string;
    let onClick: () => void;
    if (onlyMunicipality && canWidenRange(range)) {
        label = t('fewResults.widenRange');
        onClick = () => setRange(widenRange(range));
    } else if (otherFiltersActive) {
        label = t('fewResults.clearFilters');
        onClick = () => {
            setFilters(EMPTY_FILTERS);
            onClearCats();
            setQuery('');
        };
    } else {
        label = t('fewResults.zoomOut');
        onClick = onZoomOut;
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className="mt-1 shrink-0 rounded-xl border border-dashed border-border bg-background/60 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
            {label}
        </button>
    );
}
