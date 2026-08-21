'use client';

// Aliased: the window-level Escape listener below needs the DOM KeyboardEvent, which the
// React one would otherwise shadow.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronUp } from 'lucide-react';
import type { Topic } from '@prisma/client';
import { SearchInputPill } from '@/components/ui/search-input-pill';
import { type LandingListCity } from '@/lib/landing/landingData';
import { EMPTY_FILTERS, hasActiveFilters, SEARCH_FIELD_STYLE, type MapFilters } from '@/lib/landing/landingCore';
import { FilterIconButton } from './controls';
import { SearchBody } from './SearchBody';
import { searchOptionId, useSearchOptions, type SearchOption } from './hooks/useSearchOptions';
import { captureLandingAction } from '@/lib/landing/analytics';

/**
 * The options for what was typed, plus the keyboard that walks them.
 *
 * Shared by the dropdown and the overlay so both offer the same actions in the
 * same order. The cursor returns to the top on every keystroke, because every
 * keystroke changes what is on offer — leaving it where it was would point it
 * at a different action than the one the reader was looking at.
 */
function useSearchDropdown({
    query,
    onQueryChange,
    topics,
    cities,
    cats,
    filters,
    onToggleCat,
    onFiltersChange,
    onLocateAddress,
    onCommitSearch,
    onClosePanel,
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
    onCommitSearch: (q: string) => void;
    onClosePanel: () => void;
}) {
    const { options } = useSearchOptions({ query, cities, topics, cats, filters });
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    useEffect(() => setHighlightedIndex(0), [query]);

    const activate = (option: SearchOption) => {
        // `option`, not `kind`: this used to name what the box decided to do
        // with the text, and now names which row of a fixed list was picked.
        // Same four values, different question — a rename keeps the old data
        // from being read as though it answered the new one.
        captureLandingAction('search', { query_length: query.trim().length, option: option.kind });
        switch (option.kind) {
            case 'category':
                // The text has become a named filter, so the pill carries it now.
                // Stays open: applying one category is often the first of two.
                if (!cats.includes(option.topic.id)) onToggleCat(option.topic.id);
                onQueryChange('');
                return;
            case 'municipality':
                onFiltersChange({ ...filters, cityIds: [option.municipality.cityId] });
                onQueryChange('');
                return;
            case 'subjects':
                // The text stays: it is what the map is now showing, and the box
                // should read back the search rather than go blank under it.
                onCommitSearch(query);
                onClosePanel();
                return;
            case 'address':
                // Also stays — the geocoded point lives only as long as the text
                // does (see the effect in LandingV2 that clears it on an empty box).
                onLocateAddress(query);
                onClosePanel();
                return;
        }
    };

    const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
        if (!query.trim() || options.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => (i + 1) % options.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => (i - 1 + options.length) % options.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            activate(options[Math.min(highlightedIndex, options.length - 1)]);
        }
    };

    return { options, highlightedIndex, setHighlightedIndex, activate, onKeyDown };
}

/* The search field, shared by dropdown and overlay. The keys that walk the options come from
   useSearchDropdown; `className` carries the per-context shadow. */
function SearchField({
    query,
    onQueryChange,
    onKeyDown,
    combobox,
    inputRef,
    autoFocus,
    onFocus,
    className,
}: {
    query: string;
    onQueryChange: (v: string) => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
    /** ARIA for the option list this input drives — see SearchInputPill */
    combobox?: { expanded: boolean; activeOptionId?: string };
    inputRef: RefObject<HTMLInputElement | null>;
    autoFocus?: boolean;
    onFocus?: () => void;
    className?: string;
}) {
    const t = useTranslations('landingV2');
    return (
        <SearchInputPill
            value={query}
            onChange={onQueryChange}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            placeholder={t('search.placeholder')}
            clearAriaLabel={t('search.clearSearch')}
            inputRef={inputRef}
            autoFocus={autoFocus}
            className={className}
            style={SEARCH_FIELD_STYLE}
            combobox={combobox}
        />
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
    onLocateAddress,
    onCommitSearch,
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
    onLocateAddress: (q: string) => void;
    /** commit the text as a search filter over the map's subjects */
    onCommitSearch: (q: string) => void;
}) {
    const t = useTranslations('landingV2');
    const [open, setOpen] = useState(false);
    // Which half of the panel the reader asked for. The box holds its query
    // after a search, so "is there text" no longer says whether they are
    // composing a search or reaching for the filters — the control they opened
    // it with does. Mirrors MobileSearchOverlay, which has always worked this way.
    const [showFilters, setShowFilters] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const { options, highlightedIndex, setHighlightedIndex, activate, onKeyDown } = useSearchDropdown({
        query,
        onQueryChange,
        topics,
        cities,
        cats,
        filters,
        onToggleCat,
        onFiltersChange,
        onLocateAddress,
        onCommitSearch,
        onClosePanel: () => {
            setOpen(false);
            inputRef.current?.blur();
        },
    });

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
                    onKeyDown={onKeyDown}
                    combobox={{
                        expanded: open && !showFilters,
                        activeOptionId:
                            open && !showFilters && options[highlightedIndex]
                                ? searchOptionId(options[highlightedIndex], highlightedIndex)
                                : undefined,
                    }}
                    inputRef={inputRef}
                    onFocus={() => {
                        setOpen(true);
                        setShowFilters(false);
                    }}
                    className="shadow-lg"
                />
                {/* Toggles its own half of the panel, not the panel: closing on a
                    second click only makes sense if the first one is what opened
                    the filters. */}
                <FilterIconButton
                    active={hasActiveFilters(filters)}
                    onClick={() => {
                        if (open && showFilters) {
                            setOpen(false);
                            return;
                        }
                        setOpen(true);
                        setShowFilters(true);
                    }}
                />
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
                            options={options}
                            highlightedIndex={highlightedIndex}
                            onHighlight={setHighlightedIndex}
                            onActivate={activate}
                            onToggleCat={onToggleCat}
                            onClearCats={onClearCats}
                            forceFilters={showFilters}
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
    onClose,
    onToggleCat,
    onClearCats,
    onLocateAddress,
    onCommitSearch,
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
    onClose: () => void;
    onToggleCat: (topicId: string) => void;
    onClearCats: () => void;
    onLocateAddress: (q: string) => void;
    /** commit the text as a search filter over the map's subjects */
    onCommitSearch: (q: string) => void;
    /** focus the input (open the keyboard) — false when opened via the filters icon */
    autoFocusInput?: boolean;
    /** scroll to the first active filter on open (used when opened via the filters icon) */
    scrollToActiveFilter?: boolean;
}) {
    const t = useTranslations('landingV2');
    const inputRef = useRef<HTMLInputElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    // Opened via the filters icon → show the filters even with a query present. Focusing the input
    // switches to the query's results.
    const [showFilters, setShowFilters] = useState(scrollToActiveFilter);

    const { options, highlightedIndex, setHighlightedIndex, activate, onKeyDown } = useSearchDropdown({
        query,
        onQueryChange,
        topics,
        cities,
        cats,
        filters,
        onToggleCat,
        onFiltersChange,
        onLocateAddress,
        onCommitSearch,
        onClosePanel: onClose,
    });

    // Snapshot the filter state on open (the overlay remounts each time) so we can show a hint once
    // the user changes anything — filters apply live, so they need to go back to see the results.
    const snapshot = (c: string[], f: MapFilters) =>
        JSON.stringify({
            cats: [...c].sort(),
            cityIds: [...f.cityIds].sort(),
            bodyTypes: [...f.bodyTypes].sort(),
            dateFrom: f.dateFrom,
            dateTo: f.dateTo,
        });
    const initialSnapshotRef = useRef<string | null>(null);
    if (initialSnapshotRef.current === null) initialSnapshotRef.current = snapshot(cats, filters);
    const filtersChanged = initialSnapshotRef.current !== snapshot(cats, filters);

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
                    onKeyDown={onKeyDown}
                    combobox={{
                        expanded: !showFilters && query.trim().length > 0,
                        activeOptionId: options[highlightedIndex] ? searchOptionId(options[highlightedIndex], highlightedIndex) : undefined,
                    }}
                    inputRef={inputRef}
                    autoFocus={autoFocusInput}
                    onFocus={() => setShowFilters(false)}
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
                    options={options}
                    highlightedIndex={highlightedIndex}
                    onHighlight={setHighlightedIndex}
                    onActivate={activate}
                    onToggleCat={onToggleCat}
                    onClearCats={onClearCats}
                    forceFilters={showFilters}
                />
            </div>

            {/* filters apply live — once the user tweaks anything (and something is still applied),
                offer to clear or go back for results. Clearing everything hides the bar again. */}
            {filtersChanged && (hasActiveFilters(filters) || cats.length > 0) && (
                <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-card px-4 py-3">
                    <button
                        type="button"
                        onClick={() => {
                            onClearCats();
                            onFiltersChange(EMPTY_FILTERS);
                        }}
                        className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {t('common.clear')}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl bg-foreground px-6 py-2 text-sm font-semibold text-background transition hover:brightness-110"
                    >
                        {t('common.apply')}
                    </button>
                </div>
            )}
        </div>
    );
}
