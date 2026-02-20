import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ReadonlyURLSearchParams } from 'next/navigation';

export interface FilterOption<T = string | null> {
    value: T;
    label: string;
}

/**
 * Updates URL with filter parameters based on selected values
 * - Removes 'filters' param if selection matches default behavior (none selected, or matches explicit defaults, or all selected when no defaults exist)
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

    const allSelected = selectedValues.length === filterOptions.length;
    const noneSelected = selectedValues.length === 0;

    // Check if selected values match the default filter values
    const matchesDefault = defaultFilterValues &&
        selectedValues.length === defaultFilterValues.length &&
        selectedValues.every(v => defaultFilterValues.includes(v));

    // Determine if we should remove the filter parameter:
    // - No filters selected (will use defaults or all on reload)
    // - Matches explicit default values
    // - All filters selected AND no defaults exist (so "all" is the implicit default)
    const shouldRemoveParam = noneSelected ||
        matchesDefault ||
        (allSelected && !defaultFilterValues);

    if (shouldRemoveParam) {
        params.delete('filters');
    } else {
        // Convert values to labels for URL
        const selectedLabels = selectedValues
            .map(value => filterOptions.find(f => f.value === value)?.label)
            .filter((label): label is string => label !== undefined);
        params.set('filters', selectedLabels.join(','));
    }

    params.delete('page'); // Reset to page 1 on filter change
    router.replace(`?${params.toString()}`);
}
