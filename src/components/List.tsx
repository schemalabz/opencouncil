import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import FormSheet from './FormSheet';
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Input } from '@/components/ui/input';
import { cn, normalizeText } from '@/lib/utils';
import { PaginationParams } from '@/lib/db/types';
import { Badge } from './ui/badge';
import { MultiSelectDropdown } from './ui/multi-select-dropdown';
import { Button } from './ui/button';
import { updateFilterURL } from '@/lib/utils/filterURL';
import { Pagination } from './ui/pagination';
import { AdminStrip, adminToolClass } from '@/components/admin/AdminStrip';

export interface BaseListProps {
    layout?: 'grid' | 'list' | 'carousel';
    smColumns?: number;
    mdColumns?: number;
    lgColumns?: number;
    carouselItemWidth?: number;
    carouselGap?: number;
}


interface ListProps<T, P = {}, F = string | undefined> extends BaseListProps {
    items: T[];
    ItemComponent: React.ComponentType<{ item: T, editable: boolean } & P>;
    FormComponent: React.ComponentType<any>;
    formProps: any;
    editable: boolean;
    t: (key: string, params?: any) => string;
    itemProps?: P;
    filterAvailableValues?: { value: F, label: string }[];
    filter?: (selectedValues: F[], item: T) => boolean;
    allText?: string;
    showSearch?: boolean;
    /**
     * The text a row is searchable by. Without it a row is matched on its own
     * string fields, which see nothing nested — a person's roles, a party's
     * members, a meeting's administrative body all live behind a relation.
     * Keep the callback stable (`useCallback`): the normalized text it produces
     * is indexed once per items/callback change, not once per keystroke.
     */
    searchKeys?: (item: T) => (string | null | undefined)[];
    /**
     * The "N items" line. Defaults to `showSearch`, which used to gate it too.
     * Split out because a list can want one without the other: the city tabs drop
     * the search box in favour of the page's single search, but still need the
     * count — it reports the *filtered* total, which the page header (a city-wide
     * total) cannot stand in for once a filter is applied.
     */
    showCount?: boolean;
    defaultFilterValues?: F[];
    /**
     * Page size only. The page itself comes from the URL below, and a
     * `currentPage` prop was read by nobody — the server that passed one only
     * forced itself dynamic to compute it.
     */
    pagination?: Pick<PaginationParams, 'pageSize'>;
    renderFilter?: (props: { selectedValues: F[], onChange: (values: F[]) => void }) => React.ReactNode;
    renderAfterFilters?: React.ReactNode | ((selectedValues: F[]) => React.ReactNode);
    /**
     * Items listed after all the others, under their own heading — the people
     * who no longer hold a role, say. They pass the same search and filter and
     * count in the total; they only stop sharing the grid.
     */
    trailing?: { title: string; matches: (item: T) => boolean };
}

export default function List<T extends { id: string }, P = {}, F = string | undefined>({
    items,
    editable,
    ItemComponent,
    FormComponent,
    formProps,
    t,
    itemProps,
    filterAvailableValues = [],
    filter,
    smColumns = 1,
    mdColumns = 2,
    lgColumns = 3,
    allText,
    showSearch = true,
    searchKeys,
    showCount,
    layout = 'grid',
    carouselItemWidth = 300,
    carouselGap = 16,
    defaultFilterValues,
    pagination,
    renderFilter,
    renderAfterFilters,
    trailing,
}: ListProps<T, P, F>) {
    const tCommon = useTranslations('Common');
    const searchParams = useSearchParams();
    const listRef = useRef<HTMLDivElement>(null);
    const carouselRef = useRef<HTMLDivElement>(null);

    // Get filter and search values from URL
    const searchQuery = searchParams.get('search') || '';
    const rawFilters = searchParams.get('filters');
    const explicitlyAll = rawFilters === '*';
    const selectedFilterLabels = explicitlyAll ? [] : (rawFilters?.split(',').filter(Boolean) || []);

    // Local state for search input
    const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
    // A shared link carrying ?search= opens on its result, not on an icon.
    const [searchOpen, setSearchOpen] = useState(Boolean(searchQuery));
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Focus when the reader opens it, never on mount: a page arriving with
    // ?search= would otherwise steal the focus and scroll the list into view.
    const openedOnce = useRef(searchOpen);
    useEffect(() => {
        if (searchOpen && !openedOnce.current) searchInputRef.current?.focus();
        openedOnce.current = searchOpen;
    }, [searchOpen]);

    // Sync local search state with URL on browser back/forward navigation
    useEffect(() => {
        const urlSearchQuery = searchParams.get('search') || '';
        if (urlSearchQuery !== localSearchQuery) {
            setLocalSearchQuery(urlSearchQuery);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Convert filter labels to values
    // - URL has specific labels → use those
    // - URL has '*' → explicitly all (empty array = no filtering)
    // - URL has nothing → use defaultFilterValues if provided, otherwise all
    const selectedFilters = selectedFilterLabels.length > 0
        ? selectedFilterLabels.map(label =>
            filterAvailableValues.find(f => f.label === label)?.value
        ).filter((value): value is F => value !== undefined)
        : explicitlyAll
            ? [] as F[]
            : (defaultFilterValues || (renderFilter ? [] as F[] : filterAvailableValues.map(f => f.value)));

    const scrollCarouselLeft = useCallback(() => {
        if (carouselRef.current) {
            carouselRef.current.scrollBy({ left: -carouselItemWidth, behavior: 'smooth' });
        }
    }, [carouselItemWidth]);

    const scrollCarouselRight = useCallback(() => {
        if (carouselRef.current) {
            carouselRef.current.scrollBy({ left: carouselItemWidth, behavior: 'smooth' });
        }
    }, [carouselItemWidth]);

    const gridClasses = cn(
        layout === 'carousel' ? "flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent snap-x snap-mandatory" :
            layout === 'list' ? "flex flex-col gap-4" :
                "grid gap-4 sm:gap-6",
        layout === 'grid' && (
            cn(
                smColumns === 1 ? "grid-cols-1" : `grid-cols-${smColumns}`,
                mdColumns === 1 ? "md:grid-cols-1" : `md:grid-cols-${mdColumns}`,
                lgColumns === 1 ? "lg:grid-cols-1" : `lg:grid-cols-${lgColumns}`
            )
        )
    );

    const carouselItemClasses = cn(
        "flex-shrink-0 snap-start",
        layout === 'carousel' && `w-[${carouselItemWidth}px]`
    );

    // One normalized haystack per row, so a keystroke costs a substring scan
    // rather than a re-normalization of every name in the city.
    const searchIndex = useMemo(() => {
        if (!showSearch) return null;
        return new Map(items.map(item => {
            const values = searchKeys
                ? searchKeys(item)
                : Object.values(item).filter((value): value is string => typeof value === 'string');
            return [item.id, normalizeText(values.filter(Boolean).join(' '))];
        }));
    }, [items, searchKeys, showSearch]);

    // Every word has to match, so "μαρια παπα" finds "Μαρία Παπαδοπούλου"
    // whichever order the reader types the two parts of the name in.
    const searchTerms = useMemo(
        () => normalizeText(localSearchQuery).split(/\s+/).filter(Boolean),
        [localSearchQuery]
    );

    const filteredItems = items.filter((item) => {
        // First check search query
        if (searchIndex && searchTerms.length > 0) {
            const haystack = searchIndex.get(item.id) ?? '';
            if (!searchTerms.every(term => haystack.includes(term))) return false;
        }

        // Then apply filter if it exists and there are selected filters
        if (filter) {
            return filter(selectedFilters, item);
        }

        return true;
    });

    const countVisible = showCount ?? showSearch;

    // Client-side pagination — read current page from URL to avoid
    // depending on server component re-renders for page changes.
    // A query the debounce below has not written yet already narrows the list,
    // so honouring the URL's page here would show page 4 of the old result set.
    const searchPending = localSearchQuery !== searchQuery;
    const urlPage = searchPending ? 1 : parseInt(searchParams.get('page') || '1', 10);
    const totalPages = pagination
        ? Math.ceil(filteredItems.length / pagination.pageSize)
        : 1;

    const currentPage = pagination
        ? Math.max(1, Math.min(isNaN(urlPage) ? 1 : urlPage, totalPages))
        : 1;

    const pagedItems = pagination
        ? filteredItems.slice(
            (currentPage - 1) * pagination.pageSize,
            currentPage * pagination.pageSize
        )
        : filteredItems;
    const paginatedItems = trailing ? pagedItems.filter(item => !trailing.matches(item)) : pagedItems;
    const trailingItems = trailing ? pagedItems.filter(trailing.matches) : [];

    const renderItem = (item: T) => (
        <div
            key={item.id}
            className={carouselItemClasses}
            style={layout === 'carousel' ? { width: carouselItemWidth, minWidth: carouselItemWidth } : undefined}
        >
            <ItemComponent
                item={item}
                editable={editable}
                {...itemProps as P}
            />
        </div>
    );

    // Debounced URL update for search
    useEffect(() => {
        if (!showSearch) return;

        // Avoid overriding pagination/filter URL changes when the search value didn't change.
        const urlSearchQuery = searchParams.get('search') || '';
        if (localSearchQuery === urlSearchQuery) return;

        const timeoutId = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (localSearchQuery) {
                params.set('search', localSearchQuery);
            } else {
                params.delete('search');
            }
            params.delete('page'); // Reset to page 1 on search
            window.history.replaceState(null, '', `?${params.toString()}`);
        }, 300); // 300ms debounce delay

        return () => clearTimeout(timeoutId);
    }, [localSearchQuery, searchParams, showSearch]);

    // Update URL with new search or filter values
    const handleSearchChange = (query: string) => {
        if (!showSearch) return;
        setLocalSearchQuery(query);
    };

    const closeSearch = () => {
        setLocalSearchQuery('');
        setSearchOpen(false);
    };

    const handleFilterChange = (selectedValues: F[]) => {
        updateFilterURL(selectedValues, filterAvailableValues, defaultFilterValues, searchParams);
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        if (newPage > 1) {
            params.set('page', newPage.toString());
        } else {
            params.delete('page');
        }
        window.history.pushState(null, '', `?${params.toString()}`);
        requestAnimationFrame(() => {
            listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    return (
        <div ref={listRef} className="space-y-6">
            {/* One toolbar, not two stacked rows. The filter, the total it produces
                and the control that adds to it are the same thought, and splitting
                them put the count above a row it was describing. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                {renderFilter ? (
                    renderFilter({ selectedValues: selectedFilters, onChange: handleFilterChange })
                ) : filterAvailableValues && filterAvailableValues.length > 0 ? (
                    <MultiSelectDropdown
                        options={filterAvailableValues}
                        defaultValues={selectedFilters}
                        onChange={handleFilterChange}
                        className="w-full sm:w-[300px] justify-between"
                        allText={allText ?? tCommon('all')}
                    />
                ) : null}
                <div className={cn('ml-auto flex min-w-0 items-center gap-3', searchOpen && 'max-sm:w-full')}>
                    {/* Closed it is one icon, because the page header already
                        carries a full-width field that searches every transcript
                        and this one only sifts the rows below it. Open it takes
                        the width its placeholder needs — the whole row on a
                        phone, and 288px above that, which clears the longest of
                        them («Претрага одборничких група») by 30px. */}
                    {showSearch && (searchOpen ? (
                        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                            <Input
                                ref={searchInputRef}
                                type="search"
                                placeholder={t('searchItems')}
                                aria-label={t('searchItems')}
                                className="h-8 w-full border-transparent bg-muted/60 pl-8 pr-8 text-base placeholder:text-muted-foreground/70 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-offset-0 sm:text-sm"
                                value={localSearchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
                                // Closing on blur would beat the clear button's own
                                // click; an empty field left open costs nothing.
                                onBlur={() => { if (!localSearchQuery) setSearchOpen(false); }}
                            />
                            <button
                                type="button"
                                onClick={closeSearch}
                                aria-label={tCommon('clearSearch')}
                                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setSearchOpen(true)}
                            aria-label={t('searchItems')}
                            aria-expanded={false}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <Search className="h-4 w-4" aria-hidden />
                        </button>
                    ))}
                    {countVisible && (
                        <p className={cn('shrink-0 text-sm text-muted-foreground', searchOpen && 'max-sm:hidden')}>{t('items', { count: filteredItems.length })}</p>
                    )}
                    {/* Marked as back-of-house, the way the city page's own tools
                        are: an outlined pill beside a citizen's list read as part
                        of the product. */}
                    {editable && (
                        <AdminStrip>
                            <FormSheet
                                FormComponent={FormComponent}
                                formProps={formProps}
                                title={t('addItem', { title: t('item') })}
                                type="add"
                                closeOnSuccess={true}
                                triggerVariant="ghost"
                                triggerSize="sm"
                                triggerClassName={adminToolClass}
                            />
                        </AdminStrip>
                    )}
                </div>
            </div>
            {typeof renderAfterFilters === 'function' ? renderAfterFilters(selectedFilters) : renderAfterFilters}
            {filteredItems.length > 0 ? (
                <div className="relative">
                    {layout === 'carousel' && (
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-muted-foreground">
                                {t('items', { count: filteredItems.length })}
                            </p>
                            <div className="flex space-x-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-accent/10"
                                    onClick={scrollCarouselLeft}
                                >
                                    <ChevronLeft size={18} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-accent/10"
                                    onClick={scrollCarouselRight}
                                >
                                    <ChevronRight size={18} />
                                </Button>
                            </div>
                        </div>
                    )}
                    <div ref={carouselRef} className={gridClasses}>
                        {paginatedItems.map(renderItem)}
                    </div>
                    {trailingItems.length > 0 && (
                        <section className="mt-8 border-t border-border pt-6">
                            <h3 className="mb-4 text-sm font-medium text-muted-foreground">{trailing?.title}</h3>
                            <div className={gridClasses}>
                                {trailingItems.map(renderItem)}
                            </div>
                        </section>
                    )}
                </div>
            ) : (
                <p className="text-gray-600">{t('noItems', { title: t('item') })}</p>
            )}

            {pagination && totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pagination.pageSize}
                    onPageChange={handlePageChange}
                    labels={{ previous: t('previous'), next: t('next') }}
                />
            )}
        </div>
    );
}
