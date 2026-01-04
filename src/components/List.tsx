import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import FormSheet from './FormSheet';
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from '@/components/ui/input';
import { cn, normalizeText } from '@/lib/utils';
import { Badge } from './ui/badge';
import { MultiSelectDropdown } from './ui/multi-select-dropdown';
import { Button } from './ui/button';
import { updateFilterURL } from '@/lib/utils/filterURL';

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
    defaultFilterValues?: F[];
    pagination?: {
        currentPage: number;
        totalPages: number;
        pageSize: number;
    };
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
    allText = "Όλα",
    showSearch = true,
    layout = 'grid',
    carouselItemWidth = 300,
    carouselGap = 16,
    defaultFilterValues,
    pagination
}: ListProps<T, P, F>) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const carouselRef = useRef<HTMLDivElement>(null);

    // Get filter and search values from URL
    const searchQuery = searchParams.get('search') || '';
    const selectedFilterLabels = searchParams.get('filters')?.split(',').filter(Boolean) || [];

    // Local state for search input
    const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

    // Convert filter labels to values
    // If no filters in URL, use defaultFilterValues if provided, otherwise all values
    const selectedFilters = selectedFilterLabels.length > 0
        ? selectedFilterLabels.map(label =>
            filterAvailableValues.find(f => f.label === label)?.value
        ).filter((value): value is F => value !== undefined)
        : (defaultFilterValues || filterAvailableValues.map(f => f.value));

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

    const filteredItems = items.filter((item) => {
        // First check search query
        if (searchQuery && showSearch) {
            const normalizedQuery = normalizeText(searchQuery);
            const matchesSearch = Object.values(item).some(
                (value) =>
                    typeof value === 'string' &&
                    normalizeText(value).includes(normalizedQuery)
            );

            if (!matchesSearch) return false;
        }

        // Then apply filter if it exists and there are selected filters
        if (filter) {
            return filter(selectedFilters, item);
        }

        return true;
    });

    // Debounced URL update for search
    useEffect(() => {
        if (!showSearch) return;

        const timeoutId = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (localSearchQuery) {
                params.set('search', localSearchQuery);
            } else {
                params.delete('search');
            }
            router.replace(`?${params.toString()}`);
        }, 300); // 300ms debounce delay

        return () => clearTimeout(timeoutId);
    }, [localSearchQuery, router, searchParams, showSearch]);

    // Update URL with new search or filter values
    const handleSearchChange = (query: string) => {
        if (!showSearch) return;
        setLocalSearchQuery(query);
    };

    const handleFilterChange = (selectedValues: F[]) => {
        updateFilterURL(selectedValues, filterAvailableValues, defaultFilterValues, searchParams, router);
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        if (newPage > 1) {
            params.set('page', newPage.toString());
        } else {
            params.delete('page');
        }
        router.push(`?${params.toString()}`);
    };

    return (
        <div className="space-y-6">
            {(showSearch || editable) && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    {showSearch && (
                        <p className="text-sm text-muted-foreground">{t('items', { count: filteredItems.length })}</p>
                    )}
                    {editable && (
                        <FormSheet FormComponent={FormComponent} formProps={formProps} title={t('addItem', { title: t('item') })} type="add" closeOnSuccess={true} />
                    )}
                </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4">
                {filterAvailableValues && filterAvailableValues.length > 0 && (
                    <MultiSelectDropdown
                        options={filterAvailableValues}
                        defaultValues={selectedFilters}
                        onChange={handleFilterChange}
                        className="w-full sm:w-[300px] justify-between"
                        allText={allText}
                    />
                )}
                {showSearch && (
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            placeholder={t('searchItems')}
                            className="pl-10 w-full h-9"
                            value={localSearchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                    </div>
                )}
            </div>
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
                        {filteredItems.map((item) => (
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
                        ))}
                    </div>
                </div>
            ) : (
                <p className="text-gray-600">{t('noItems', { title: t('item') })}</p>
            )}

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage - 1)}
                        disabled={pagination.currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                    </Button>

                    <div className="flex gap-1">
                        {(() => {
                            const { currentPage, totalPages } = pagination;
                            const pages: (number | string)[] = [];
                            const maxVisible = 7;

                            if (totalPages <= maxVisible) {
                                for (let i = 1; i <= totalPages; i++) pages.push(i);
                            } else {
                                pages.push(1);

                                if (currentPage > 3) pages.push('...');

                                const start = Math.max(2, currentPage - 1);
                                const end = Math.min(totalPages - 1, currentPage + 1);

                                for (let i = start; i <= end; i++) {
                                    if (!pages.includes(i)) pages.push(i);
                                }

                                if (currentPage < totalPages - 2) pages.push('...');

                                if (!pages.includes(totalPages)) pages.push(totalPages);
                            }

                            return pages.map((page, idx) =>
                                page === '...' ? (
                                    <span key={`ellipsis-${idx}`} className="px-2 py-1">...</span>
                                ) : (
                                    <Button
                                        key={page}
                                        variant={page === currentPage ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => handlePageChange(page as number)}
                                        className="min-w-[40px]"
                                    >
                                        {page}
                                    </Button>
                                )
                            );
                        })()}
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage + 1)}
                        disabled={pagination.currentPage === pagination.totalPages}
                    >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            )}
        </div>
    );
}
