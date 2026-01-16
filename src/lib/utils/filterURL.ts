import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ReadonlyURLSearchParams } from 'next/navigation';

export interface FilterOption<T = string | null> {
    value: T;
    label: string;
}

/**
 * Updates URL with filter parameters based on selected values
 * - Removes 'filters' param if all selected, none selected, or matches default
 * - Otherwise sets 'filters' param to comma-separated labels
 */
export function updateFilterURL<T>(
    selectedValues: T[],
    filterOptions: FilterOption<T>[],
    defaultFilterValues: T[] | undefined,
    searchParams: ReadonlyURLSearchParams,
    router: AppRouterInstance
): void {
    const params = new URLSearchParams(searchParams.toString());

    // Check if selected values match the default filter values
    const matchesDefault = defaultFilterValues &&
        selectedValues.length === defaultFilterValues.length &&
        selectedValues.every(v => defaultFilterValues.includes(v));

    // If all filters are selected, no filters are selected, or matches default, remove the filter parameter
    if (selectedValues.length === filterOptions.length ||
        selectedValues.length === 0 ||
        matchesDefault) {
        params.delete('filters');
    } else {
        // Convert values to labels for URL
        const selectedLabels = selectedValues
            .map(value => filterOptions.find(f => f.value === value)?.label)
            .filter((label): label is string => label !== undefined);
        params.set('filters', selectedLabels.join(','));
    }

    router.replace(`?${params.toString()}`);
}
