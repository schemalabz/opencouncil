import React, { useState } from 'react';
import FormSheet from './FormSheet';
import { Search, ChevronDown } from "lucide-react";
import { Input } from '@/components/ui/input';
import { cn, normalizeText } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from './ui/button';
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
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFilters, setSelectedFilters] = useState<F[]>(filterAvailableValues.map(value => value.value));

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

    const handleFilterChange = (value: F, checked: boolean) => {
        setSelectedFilters(prev =>
            checked
                ? [...prev, value]
                : prev.filter(v => v !== value)
        );
    };

    const getFilterButtonText = () => {
        if (selectedFilters.length === 0) return "Καμία επιλογή";
        if (selectedFilters.length === filterAvailableValues.length) return allText;

        const firstFilter = filterAvailableValues.find(f => f.value === selectedFilters[0]);
        if (selectedFilters.length === 1) return firstFilter?.label;

        return (
            <div className="flex items-center gap-2">
                {firstFilter?.label}
                <Badge variant="secondary" className="ml-1">+{selectedFilters.length - 1}</Badge>
            </div>
        );
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
                        defaultValues={filterAvailableValues.map(value => value.value)}
                        onChange={setSelectedFilters}
                        className="w-full sm:w-[300px] justify-between"
                        allText={allText}
                    />
                )}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder={t('searchItems')}
                        className="pl-10 w-full h-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
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
