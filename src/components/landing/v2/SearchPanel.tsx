'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Search, ArrowLeft, ChevronUp, X } from 'lucide-react';
import type { Topic } from '@prisma/client';
import { cn } from '@/lib/utils';
import {
    detectMunicipalityQuery,
    detectCategoryQuery,
    type LandingListCity,
    type LandingSubject,
    type QueryKind,
} from '@/lib/landing/landingData';
import { hasActiveFilters, SEARCH_FIELD_STYLE, type MapFilters } from '@/lib/landing/landingCore';
import { FilterIconButton } from './controls';
import { SearchBody } from './SearchBody';
import { captureLandingAction } from '@/lib/landing/analytics';

/* The search field (icon · input · clear), shared by dropdown and overlay. Enter applies a
   matched category/municipality filter (clearing the text) or geocodes an address, then calls
   onAfterSubmit. `className` carries the per-context shadow. */
function SearchField({
    query,
    onQueryChange,
    topics,
    cities,
    cats,
    filters,
    onToggleCat,
    onFiltersChange,
    onLocateAddress,
    onAfterSubmit,
    inputRef,
    autoFocus,
    onFocus,
    className,
}: {
    query: string;
    onQueryChange: (v: string) => void;
    topics: Topic[];
    cities: LandingListCity[];
    cats: string[];
    filters: MapFilters;
    onToggleCat: (topicId: string) => void;
    onFiltersChange: (next: MapFilters) => void;
    onLocateAddress: (q: string) => void;
    /** caller-specific action after a committed search (close the dropdown / overlay, blur) */
    onAfterSubmit?: () => void;
    inputRef: RefObject<HTMLInputElement | null>;
    autoFocus?: boolean;
    onFocus?: () => void;
    className?: string;
}) {
    const t = useTranslations('landingV2');
    return (
        <label
            style={SEARCH_FIELD_STYLE}
            className={cn(
                'flex h-11 flex-1 items-center gap-2.5 rounded-2xl border px-4 focus-within:ring-2 focus-within:ring-[hsl(var(--orange))]/25',
                className,
            )}
        >
            <Search className="h-4 w-4 shrink-0 text-[hsl(var(--orange))]" />
            <input
                ref={inputRef}
                autoFocus={autoFocus}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key !== 'Enter' || !query.trim()) return;
                    // category/municipality → apply filter; anything else → geocode as address
                    const catId = detectCategoryQuery(query, topics);
                    const municipality = detectMunicipalityQuery(query, cities);
                    captureLandingAction('search', {
                        query_length: query.trim().length,
                        kind: catId ? 'category' : municipality?.kind === 'known' ? 'municipality' : 'address',
                    });
                    if (catId) {
                        if (!cats.includes(catId)) onToggleCat(catId);
                        onQueryChange('');
                    } else if (municipality?.kind === 'known') {
                        onFiltersChange({ ...filters, cityIds: [municipality.cityId] });
                        onQueryChange('');
                    } else {
                        onLocateAddress(query);
                    }
                    onAfterSubmit?.();
                }}
                onFocus={onFocus}
                className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
                placeholder={t('search.placeholder')}
            />
            {query && (
                <button
                    type="button"
                    aria-label={t('search.clearSearch')}
                    onClick={() => {
                        onQueryChange('');
                        inputRef.current?.focus();
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </label>
    );
}

/* desktop search — mobile-style rounded pill with a trailing filters toggle;
   focusing the input or pressing the toggle drops down the suggestions + filters */
export function DesktopSearch({
    topics,
    cities,
    cats,
    onToggleCat,
    onClearCats,
    filters,
    onFiltersChange,
    query,
    onQueryChange,
    queryKind,
    results,
    loading,
    onPickResult,
    onLocateAddress,
}: {
    topics: Topic[];
    cities: LandingListCity[];
    cats: string[];
    onToggleCat: (topicId: string) => void;
    onClearCats: () => void;
    filters: MapFilters;
    onFiltersChange: (next: MapFilters) => void;
    query: string;
    onQueryChange: (v: string) => void;
    queryKind: QueryKind;
    results: LandingSubject[];
    loading?: boolean;
    onPickResult: (id: string) => void;
    onLocateAddress: (q: string) => void;
}) {
    const t = useTranslations('landingV2');
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape. Ignore date inputs — the native calendar renders
    // outside the dropdown.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as HTMLElement;
            if (target instanceof HTMLInputElement && target.type === 'date') return;
            if (!rootRef.current?.contains(target)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <div className="flex items-center gap-2">
                <SearchField
                    query={query}
                    onQueryChange={onQueryChange}
                    topics={topics}
                    cities={cities}
                    cats={cats}
                    filters={filters}
                    onToggleCat={onToggleCat}
                    onFiltersChange={onFiltersChange}
                    onLocateAddress={onLocateAddress}
                    onAfterSubmit={() => {
                        setOpen(false);
                        inputRef.current?.blur();
                    }}
                    inputRef={inputRef}
                    onFocus={() => setOpen(true)}
                    className="shadow-lg"
                />
                <FilterIconButton active={hasActiveFilters(filters)} onClick={() => setOpen((o) => !o)} />
            </div>
            {open && (
                <div className="absolute inset-x-0 top-[calc(100%+8px)] flex max-h-[min(560px,calc(100dvh-220px))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                    <div className="flex shrink-0 justify-end px-2 pt-2">
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={() => setOpen(false)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <ChevronUp className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="overflow-y-auto px-4 pb-4 pt-1">
                        <SearchBody
                            topics={topics}
                            cities={cities}
                            cats={cats}
                            filters={filters}
                            onFiltersChange={onFiltersChange}
                            query={query}
                            queryKind={queryKind}
                            results={results}
                            loading={loading}
                            onPickResult={(id) => {
                                onPickResult(id);
                                setOpen(false);
                            }}
                            onPickKeyword={(k) => onQueryChange(k)}
                            // picking a category toggles the filter in place — keep the dropdown open
                            onToggleCat={onToggleCat}
                            onClearCats={onClearCats}
                            onLocateAddress={(q) => {
                                onLocateAddress(q);
                                setOpen(false);
                                inputRef.current?.blur();
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

/* full-screen search suggestions (mobile) — δήμοι, κατηγορίες, δημοφιλείς αναζητήσεις */
export function MobileSearchOverlay({
    topics,
    cities,
    cats,
    filters,
    onFiltersChange,
    query,
    onQueryChange,
    queryKind,
    results,
    loading,
    onPickResult,
    onClose,
    onToggleCat,
    onClearCats,
    onLocateAddress,
    autoFocusInput = true,
    scrollToActiveFilter = false,
}: {
    topics: Topic[];
    cities: LandingListCity[];
    cats: string[];
    filters: MapFilters;
    onFiltersChange: (next: MapFilters) => void;
    query: string;
    onQueryChange: (v: string) => void;
    queryKind: QueryKind;
    results: LandingSubject[];
    loading?: boolean;
    onPickResult: (id: string) => void;
    onClose: () => void;
    onToggleCat: (topicId: string) => void;
    onClearCats: () => void;
    onLocateAddress: (q: string) => void;
    /** focus the input (open the keyboard) — false when opened via the filters icon */
    autoFocusInput?: boolean;
    /** scroll to the first active filter on open (used when opened via the filters icon) */
    scrollToActiveFilter?: boolean;
}) {
    const t = useTranslations('landingV2');
    const inputRef = useRef<HTMLInputElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Opened via the filters icon → don't steal focus; scroll the first active filter into view.
    useEffect(() => {
        if (!scrollToActiveFilter) return;
        const key = filters.cityIds.length
            ? 'municipalities'
            : filters.bodyTypes.length
              ? 'bodytype'
              : filters.dateFrom || filters.dateTo
                ? 'dates'
                : null;
        if (!key) return;
        const el = contentRef.current?.querySelector<HTMLElement>(`[data-filter="${key}"]`);
        el?.scrollIntoView({ block: 'start' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scrollToActiveFilter]);

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.back')}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <SearchField
                    query={query}
                    onQueryChange={onQueryChange}
                    topics={topics}
                    cities={cities}
                    cats={cats}
                    filters={filters}
                    onToggleCat={onToggleCat}
                    onFiltersChange={onFiltersChange}
                    onLocateAddress={onLocateAddress}
                    onAfterSubmit={onClose}
                    inputRef={inputRef}
                    autoFocus={autoFocusInput}
                    className="shadow-sm"
                />
            </div>

            <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                <SearchBody
                    topics={topics}
                    cities={cities}
                    cats={cats}
                    filters={filters}
                    onFiltersChange={onFiltersChange}
                    query={query}
                    queryKind={queryKind}
                    results={results}
                    loading={loading}
                    onPickResult={onPickResult}
                    onPickKeyword={(k) => onQueryChange(k)}
                    onToggleCat={onToggleCat}
                    onClearCats={onClearCats}
                    onLocateAddress={(q) => {
                        onLocateAddress(q);
                        onClose();
                    }}
                />
            </div>
        </div>
    );
}
