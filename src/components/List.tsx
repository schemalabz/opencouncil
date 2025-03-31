import React, { useCallback, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import FormSheet from './FormSheet';
import { Search } from "lucide-react";
import { Input } from '@/components/ui/input';
import { cn, normalizeText } from '@/lib/utils';
import { Badge } from './ui/badge';
import { MultiSelectDropdown } from './ui/multi-select-dropdown';

interface ListProps<T, P = {}, F = string | undefined> {
    items: T[];
    ItemComponent: React.ComponentType<{ item: T, editable: boolean } & P>;
    FormComponent: React.ComponentType<any>;
    formProps: any;
    editable: boolean;
    t: (key: string, params?: any) => string;
    itemProps?: P;
    filterAvailableValues?: { value: F, label: string }[];
    filter?: (selectedValues: F[], item: T) => boolean;
    smColumns?: number;
    mdColumns?: number;
    lgColumns?: number;
    allText?: string;
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
}: ListProps<T, P, F>) {
    const router = useRouter();
    const searchParams = useSearchParams();

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

    const gridClasses = cn(
        "grid gap-4 sm:gap-6",
        smColumns === 1 ? "grid-cols-1" : `grid-cols-${smColumns}`,
        mdColumns === 1 ? "md:grid-cols-1" : `md:grid-cols-${mdColumns}`,
        lgColumns === 1 ? "lg:grid-cols-1" : `lg:grid-cols-${lgColumns}`
    );

    const filteredItems = items.filter((item) => {
        // First check search query
        if (searchQuery) {
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
    }, [localSearchQuery, router, searchParams]);

    // Update URL with new search or filter values
    const handleSearchChange = (query: string) => {
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
        
        router.replace(`?${params.toString()}`);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-sm text-muted-foreground">{t('items', { count: filteredItems.length })}</p>
                {editable && (
                    <FormSheet FormComponent={FormComponent} formProps={formProps} title={t('addItem', { title: t('item') })} type="add" />
                )}
            </div>
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
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder={t('searchItems')}
                        className="pl-10 w-full h-9"
                        value={localSearchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                    />
                </div>
            </div>
            {filteredItems.length > 0 ? (
                <div className={gridClasses}>
                    {filteredItems.map((item) => (
                        <ItemComponent
                            key={item.id}
                            item={item}
                            editable={editable}
                            {...itemProps as P}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-gray-600">{t('noItems', { title: t('item') })}</p>
            )}
        </div>
    );
}
