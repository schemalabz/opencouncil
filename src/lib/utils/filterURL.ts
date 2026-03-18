import { ReadonlyURLSearchParams } from 'next/navigation';

export interface FilterOption<T = string | null> {
    value: T;
    label: string;
}

/**
 * Updates URL with filter parameters based on selected values.
 * Uses window.history.replaceState for instant client-side URL updates
 * without triggering a Next.js server component re-render.
 *
 * - Removes 'filters' param if selection matches default behavior (none selected, or matches explicit defaults, or all selected when no defaults exist)
 * - Otherwise sets 'filters' param to comma-separated labels
 */
export function updateFilterURL<T>(
    selectedValues: T[],
    filterOptions: FilterOption<T>[],
    defaultFilterValues: T[] | undefined,
    searchParams: ReadonlyURLSearchParams
): void {
    const params = new URLSearchParams(searchParams.toString());

    const allSelected = selectedValues.length === filterOptions.length;
    const noneSelected = selectedValues.length === 0;

    // Check if selected values match the default filter values
    const matchesDefault = defaultFilterValues &&
        selectedValues.length === defaultFilterValues.length &&
        selectedValues.every(v => defaultFilterValues.includes(v));

    // Determine if we should remove the filter parameter:
    // - Matches explicit default values → remove (reload will re-apply defaults)
    // - All filters selected AND no defaults exist → remove (implicit default is "all")
    // - No filters selected AND no defaults → remove
    // - No filters selected BUT defaults exist → set '*' sentinel so we don't fall back to defaults
    const shouldRemoveParam = matchesDefault ||
        (allSelected && !defaultFilterValues) ||
        (noneSelected && !defaultFilterValues);

    if (shouldRemoveParam) {
        params.delete('filters');
    } else if (noneSelected && defaultFilterValues) {
        // Sentinel: distinguish "user explicitly chose all" from "no filter in URL" (which applies defaults)
        params.set('filters', '*');
    } else {
        // Convert values to labels for URL
        const selectedLabels = selectedValues
            .map(value => filterOptions.find(f => f.value === value)?.label)
            .filter((label): label is string => label !== undefined);
        params.set('filters', selectedLabels.join(','));
    }

    params.delete('page'); // Reset to page 1 on filter change
    window.history.replaceState(null, '', `?${params.toString()}`);
}
