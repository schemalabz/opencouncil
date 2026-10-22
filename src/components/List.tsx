import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import FormSheet from './FormSheet';
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Pagination } from './ui/pagination';
import { AdminStrip, adminToolClass } from '@/components/admin/AdminStrip';
import { belowHeaderScrollMargin } from '@/components/layout/headerOffset';
import type { CollectionState } from './collection/types';

export interface BaseListProps {
    layout?: 'grid' | 'list' | 'carousel';
    smColumns?: number;
    mdColumns?: number;
    lgColumns?: number;
    carouselItemWidth?: number;
    carouselGap?: number;
}

interface ListProps<T, P = {}, F = string | undefined> extends BaseListProps {
    /** What to draw. A source hook fills it: useLocalCollection or useServerCollection. */
    state: CollectionState<T, F>;
    ItemComponent: React.ComponentType<{ item: T, editable: boolean } & P>;
    FormComponent: React.ComponentType<any>;
    formProps: any;
    editable: boolean;
    t: (key: string, params?: any) => string;
    itemProps?: P;
    /** The "N items" line. Defaults to whether the source has a search. */
    showCount?: boolean;
    /**
     * Reads the count aloud when it changes. For a source whose results arrive
     * after a wait; a list that filters as the reader types would read a
     * number for every letter.
     */
    announceCount?: boolean;
    /**
     * Extra back-of-house controls for the strip that already holds "add item".
     * A render prop, because a tool usually acts on whatever the filters have
     * narrowed to — the elected order applies to the one body on screen.
     *
     * `editable` does not gate it: the strip opens to anyone who may edit the
     * city, and a tool can be narrower than that. Return null where the tool
     * does not apply; a strip with nothing in it is not drawn.
     */
    adminTools?: (selectedValues: F[]) => React.ReactNode;
    renderFilter?: (props: { selectedValues: F[], onChange: (values: F[]) => void }) => React.ReactNode;
    renderAfterFilters?: React.ReactNode | ((selectedValues: F[]) => React.ReactNode);
    /**
     * Rows listed after all the others, under their own heading: the people
     * who no longer hold a role, say. They pass the same search and filter
     * and count in the total; they only stop sharing the grid.
     */
    trailing?: { title: string; matches: (item: T) => boolean };
}

export default function List<T extends { id: string }, P = {}, F = string | undefined>({
    state,
    editable,
    adminTools,
    ItemComponent,
    FormComponent,
    formProps,
    t,
    itemProps,
    smColumns = 1,
    mdColumns = 2,
    lgColumns = 3,
    showCount,
    announceCount = false,
    layout = 'grid',
    carouselItemWidth = 300,
    carouselGap = 16,
    renderFilter,
    renderAfterFilters,
    trailing,
}: ListProps<T, P, F>) {
    const tCommon = useTranslations('Common');
    const listRef = useRef<HTMLDivElement>(null);
    const carouselRef = useRef<HTMLDivElement>(null);

    // A shared link carrying ?search= opens on its result, not on an icon.
    const { search } = state;
    const [searchOpen, setSearchOpen] = useState(Boolean(search?.query));
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Focus when the reader opens it, never on mount: a page arriving with
    // ?search= would otherwise steal the focus and scroll the list into view.
    const openedOnce = useRef(searchOpen);
    useEffect(() => {
        if (searchOpen && !openedOnce.current) searchInputRef.current?.focus();
        openedOnce.current = searchOpen;
    }, [searchOpen]);

    const scrollListIntoView = useCallback(() => {
        requestAnimationFrame(() => {
            listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, []);

    // Scroll once the page the reader asked for is on screen: at once for a
    // local source, after the navigation for a server one.
    const scrollToList = useRef(false);
    useEffect(() => {
        if (!scrollToList.current || state.pending) return;
        scrollToList.current = false;
        scrollListIntoView();
    }, [state.page, state.pending, scrollListIntoView]);

    const handlePageChange = (page: number) => {
        // The page on screen does not change, so the effect above would never
        // run, and a flag left set would scroll on some later, unrelated
        // page change. Scroll now instead.
        if (page === state.page) {
            scrollListIntoView();
        } else {
            scrollToList.current = true;
        }
        state.setPage(page);
    };

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

    const countVisible = showCount ?? search !== null;
    const mainRows = trailing ? state.rows.filter(item => !trailing.matches(item)) : state.rows;
    const trailingRows = trailing ? state.rows.filter(trailing.matches) : [];
    // Called once, so the strip can tell a tool that renders from one that
    // returns null: an empty striped box beside a citizen's list is noise.
    const tools = adminTools?.(state.selectedFilters) ?? null;

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

    const closeSearch = () => {
        search?.setQuery('');
        setSearchOpen(false);
    };

    return (
        <div ref={listRef} className={cn("space-y-6", belowHeaderScrollMargin)}>
            {/* One toolbar, not two stacked rows. The filter, the total it produces
                and the control that adds to it are the same thought, and splitting
                them put the count above a row it was describing. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                {renderFilter?.({ selectedValues: state.selectedFilters, onChange: state.setFilters })}
                <div className={cn('ml-auto flex min-w-0 items-center gap-3', searchOpen && 'max-sm:w-full')}>
                    {/* Closed it is one icon, because the page header already
                        carries a full-width field that searches every transcript
                        and this one only sifts the rows below it. Open it takes
                        the width its placeholder needs — the whole row on a
                        phone, and 288px above that, which clears the longest of
                        them («Претрага одборничких група») by 30px. */}
                    {search && (searchOpen ? (
                        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                            <Input
                                ref={searchInputRef}
                                type="search"
                                placeholder={t('searchItems')}
                                aria-label={t('searchItems')}
                                className="h-8 w-full border-transparent bg-muted/60 pl-8 pr-8 text-base placeholder:text-muted-foreground/70 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-offset-0 sm:text-sm"
                                value={search.query}
                                onChange={(e) => search.setQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
                                // Closing on blur would beat the clear button's own
                                // click; an empty field left open costs nothing.
                                onBlur={() => { if (!search.query) setSearchOpen(false); }}
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
                        <p role={announceCount ? 'status' : undefined} className={cn('shrink-0 text-sm text-muted-foreground', searchOpen && 'max-sm:sr-only')}>
                            {t('items', { count: state.total })}
                        </p>
                    )}
                    {/* Marked as back-of-house, the way the city page's own tools
                        are: an outlined pill beside a citizen's list read as part
                        of the product. */}
                    {(editable || tools) && (
                        <AdminStrip>
                            {tools}
                            {editable && <FormSheet
                                FormComponent={FormComponent}
                                formProps={formProps}
                                title={t('addItem', { title: t('item') })}
                                type="add"
                                closeOnSuccess={true}
                                triggerVariant="ghost"
                                triggerSize="sm"
                                triggerClassName={adminToolClass}
                            />}
                        </AdminStrip>
                    )}
                </div>
            </div>
            {typeof renderAfterFilters === 'function' ? renderAfterFilters(state.selectedFilters) : renderAfterFilters}
            {state.total > 0 ? (
                <div
                    className={cn('relative transition-opacity', state.pending && 'opacity-60')}
                    aria-busy={state.pending}
                    data-testid="collection-rows"
                >
                    {layout === 'carousel' && (
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-muted-foreground">
                                {t('items', { count: state.total })}
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
                        {mainRows.map(renderItem)}
                    </div>
                    {trailingRows.length > 0 && (
                        <section className="mt-8 border-t border-border pt-6">
                            <h3 className="mb-4 text-sm font-medium text-muted-foreground">{trailing?.title}</h3>
                            <div className={gridClasses}>
                                {trailingRows.map(renderItem)}
                            </div>
                        </section>
                    )}
                </div>
            ) : (
                <p className="text-gray-600">{t('noItems', { title: t('item') })}</p>
            )}

            {state.totalPages > 1 && (
                <Pagination
                    page={state.page}
                    totalPages={state.totalPages}
                    onPageChange={handlePageChange}
                    getHref={state.hrefForPage}
                    labels={{ previous: t('previous'), next: t('next'), navigation: tCommon('pagination') }}
                />
            )}
        </div>
    );
}
