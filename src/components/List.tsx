import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import FormSheet from './FormSheet';
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from '@/components/ui/input';
import { cn, normalizeText } from '@/lib/utils';
import { PaginationParams } from '@/lib/db/types';
import { Badge } from './ui/badge';
import { MultiSelectDropdown } from './ui/multi-select-dropdown';
import { Button } from './ui/button';
import { Pagination } from './ui/pagination';

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
    pagination?: PaginationParams;
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
    const selectedFilters = selectedFilterLabels.length > 0
        ? selectedFilterLabels.map(label =>
            filterAvailableValues.find(f => f.label === label)?.value
        ).filter((value): value is F => value !== undefined)
        : filterAvailableValues.map(f => f.value);

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

    // Client-side pagination: slice filtered items
    const paginatedItems = pagination
        ? filteredItems.slice(
            (pagination.currentPage - 1) * pagination.pageSize,
            pagination.currentPage * pagination.pageSize
        )
        : filteredItems;

    const totalPages = pagination
        ? Math.ceil(filteredItems.length / pagination.pageSize)
        : 1;

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
            params.delete('page'); // Reset to page 1 on search
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
        const params = new URLSearchParams(searchParams.toString());

        // If all filters are selected or no filters are selected, remove the filter parameter
        if (selectedValues.length === filterAvailableValues.length || selectedValues.length === 0) {
            params.delete('filters');
        } else {
            // Convert values to labels for URL
            const selectedLabels = selectedValues
                .map(value => filterAvailableValues.find(f => f.value === value)?.label)
                .filter((label): label is string => label !== undefined);
            params.set('filters', selectedLabels.join(','));
        }

        params.delete('page'); // Reset to page 1 on filter change
        router.replace(`?${params.toString()}`);
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
                        {paginatedItems.map((item) => (
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

            {pagination && totalPages > 1 && (
                <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={totalPages}
                    pageSize={pagination.pageSize}
                    onPageChange={handlePageChange}
                    labels={{ previous: t('previous'), next: t('next') }}
                />
            )}
        </div>
    );
}
