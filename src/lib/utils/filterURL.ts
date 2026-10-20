import { readPageParam } from '@/lib/zod-schemas/listQuery';

export interface FilterOption<T = string | null> {
    value: T;
    label: string;
}

/** What a collection URL names. The server page and both client sources read it here, so the three agree. */
export interface CollectionView<F> {
    query: string;
    selectedFilters: F[];
    selectedBody: string | null;
    page: number;
}

export interface CollectionFilterConfig<F> {
    filterOptions: FilterOption<F>[];
    /** The selection that a URL without `filters` means. */
    defaultFilterValues?: F[];
    /** The bodies that one selected type offers. An empty list means that the type has no body picker. */
    bodyOptionsFor?: (type: F) => FilterOption<string>[];
}

/** The bodies a selection offers: those of its one type, or none when it names zero or several types. */
export function bodyOptionsForSelection<F>(
    selectedFilters: F[],
    bodyOptionsFor?: (type: F) => FilterOption<string>[],
): FilterOption<string>[] {
    return selectedFilters.length === 1 && bodyOptionsFor ? bodyOptionsFor(selectedFilters[0]) : [];
}

/** A page's `searchParams` prop as URLSearchParams, for the shared parser. */
export function toURLSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(record)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
    }
    return params;
}

/**
 * Reads the view a collection URL names.
 *
 * - `filters` holds labels; `*` is an explicit "all"; no `filters` applies the defaults, or
 *   none ("all") when there are no defaults.
 * - `body` holds a body's label and counts only within the one selected type.
 * - `page` is 1 when missing or not a positive number. The caller clamps it to the last page.
 */
export function parseCollectionParams<F>(
    params: { get(name: string): string | null },
    { filterOptions, defaultFilterValues, bodyOptionsFor }: CollectionFilterConfig<F>,
): CollectionView<F> {
    const rawFilters = params.get('filters');
    const explicitlyAll = rawFilters === '*';
    const labels = explicitlyAll ? [] : (rawFilters?.split(',').filter(Boolean) ?? []);
    const selectedFilters = labels.length > 0
        ? labels
            .map(label => filterOptions.find(f => f.label === label)?.value)
            .filter((value): value is F => value !== undefined)
        : explicitlyAll
            ? []
            : (defaultFilterValues ?? []);

    const bodyLabel = params.get('body');
    const selectedBody = bodyLabel
        ? bodyOptionsForSelection(selectedFilters, bodyOptionsFor).find(o => o.label === bodyLabel)?.value ?? null
        : null;

    return { query: params.get('search') ?? '', selectedFilters, selectedBody, page: readPageParam(params.get('page')) };
}

/**
 * The params with a new type selection.
 *
 * - Removes 'filters' if the selection matches the default behavior (none selected, or matches explicit defaults, or all selected when no defaults exist)
 * - Otherwise sets 'filters' to comma-separated labels
 * - Always clears 'body', since changing the type invalidates the body selection, and 'page'
 */
export function withFilterSelection<T>(
    params: URLSearchParams,
    selectedValues: T[],
    filterOptions: FilterOption<T>[],
    defaultFilterValues: T[] | undefined,
): URLSearchParams {
    const next = new URLSearchParams(params);

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
        next.delete('filters');
    } else if (noneSelected && defaultFilterValues) {
        // Sentinel: distinguish "user explicitly chose all" from "no filter in URL" (which applies defaults)
        next.set('filters', '*');
    } else {
        // Convert values to labels for URL
        const selectedLabels = selectedValues
            .map(value => filterOptions.find(f => f.value === value)?.label)
            .filter((label): label is string => label !== undefined);
        next.set('filters', selectedLabels.join(','));
    }

    next.delete('body'); // Changing type filter invalidates body selection
    next.delete('page'); // Reset to page 1 on filter change
    return next;
}

/** The params with a new body selection. Stores the body's label, for readability and shareability. */
export function withBodySelection(
    params: URLSearchParams,
    bodyId: string | null,
    bodyOptions: FilterOption<string>[],
): URLSearchParams {
    const next = new URLSearchParams(params);
    const label = bodyId ? bodyOptions.find(o => o.value === bodyId)?.label : undefined;
    if (label) {
        next.set('body', label);
    } else {
        next.delete('body');
    }
    next.delete('page'); // Reset to page 1 on body change
    return next;
}

/** The params with new search text. A new query starts again at page 1. */
export function withSearchQuery(params: URLSearchParams, query: string): URLSearchParams {
    const next = new URLSearchParams(params);
    if (query) {
        next.set('search', query);
    } else {
        next.delete('search');
    }
    next.delete('page');
    return next;
}

/** The params on another page. Page 1 is the URL without `page`. */
export function withPage(params: URLSearchParams, page: number): URLSearchParams {
    const next = new URLSearchParams(params);
    if (page > 1) {
        next.set('page', page.toString());
    } else {
        next.delete('page');
    }
    return next;
}
