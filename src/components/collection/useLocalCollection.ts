"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { matchesEveryTerm, normalizeText, searchTerms } from '@/lib/utils';
import {
    bodyOptionsForSelection,
    parseCollectionParams,
    withBodySelection,
    withFilterSelection,
    withPage,
    withSearchQuery,
    type CollectionFilterConfig,
} from '@/lib/utils/filterURL';
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useQueryParamState';
import type { CollectionState } from './types';

/** The filter configuration is optional here: a list with no filter passes none of it. */
export type LocalCollectionOptions<T, F> = Partial<CollectionFilterConfig<F>> & {
    filter?: (selectedValues: F[], item: T, selectedBody: string | null) => boolean;
    /**
     * The text a row is searchable by. Without it a row is matched on its own
     * string fields, which see nothing nested — a person's roles, a party's
     * members, a meeting's administrative body all live behind a relation.
     * Keep the callback stable (`useCallback`): the normalized text it produces
     * is indexed once per items/callback change, not once per keystroke.
     */
    searchKeys?: (item: T) => (string | null | undefined)[];
    /**
     * Orders the rows that passed the search and the filter, with the
     * selection in hand — a list whose order depends on what is selected, such
     * as the members of one body in that body's order. Without it the rows
     * keep the order of `items`.
     */
    sortItems?: (items: T[], selectedValues: F[], selectedBody: string | null) => T[];
};

/** A collection loaded whole through props: filtered and searched in the browser, on one page. */
export function useLocalCollection<T extends { id: string }, F = string | undefined>(
    items: T[],
    {
        filterOptions = [],
        defaultFilterValues,
        bodyOptionsFor,
        filter,
        searchKeys,
        sortItems,
    }: LocalCollectionOptions<T, F> = {},
): CollectionState<T, F> {
    const searchParams = useSearchParams();
    const view = parseCollectionParams<F>(searchParams, { filterOptions, defaultFilterValues, bodyOptionsFor });

    const [query, setQuery] = useState(view.query);

    // Sync the search text with the URL on browser back/forward navigation.
    useEffect(() => {
        const urlQuery = searchParams.get('search') || '';
        if (urlQuery !== query) setQuery(urlQuery);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // One normalized haystack per row, so a keystroke costs a substring scan
    // rather than a re-normalization of every name in the city.
    const searchIndex = useMemo(() => new Map(items.map(item => {
        const values = searchKeys
            ? searchKeys(item)
            : Object.values(item).filter((value): value is string => typeof value === 'string');
        return [item.id, normalizeText(values.filter(Boolean).join(' '))];
    })), [items, searchKeys]);

    const terms = useMemo(() => searchTerms(query), [query]);

    const matchingItems = items.filter(item => {
        if (terms.length > 0 && !matchesEveryTerm(searchIndex.get(item.id) ?? '', terms)) return false;
        if (filter) return filter(view.selectedFilters, item, view.selectedBody);
        return true;
    });
    const rows = sortItems ? sortItems(matchingItems, view.selectedFilters, view.selectedBody) : matchingItems;

    // Debounced URL update for search
    useEffect(() => {
        // Avoid overriding filter URL changes when the search value didn't change.
        const urlQuery = searchParams.get('search') || '';
        if (query === urlQuery) return;

        const timeoutId = setTimeout(() => {
            const params = withSearchQuery(new URLSearchParams(searchParams.toString()), query);
            try {
                window.history.replaceState(null, '', `?${params.toString()}`);
            } catch {
                // A browser that is rate-limiting history calls keeps the old
                // URL. The list still filters; only Back stops restoring it.
            }
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timeoutId);
    }, [query, searchParams]);

    const currentParams = useCallback(() => new URLSearchParams(searchParams.toString()), [searchParams]);
    const pushParams = useCallback((params: URLSearchParams) => {
        window.history.pushState(null, '', `?${params.toString()}`);
    }, []);

    return {
        rows,
        total: rows.length,
        page: 1,
        totalPages: 1,
        search: { query, setQuery },
        selectedFilters: view.selectedFilters,
        selectedBody: view.selectedBody,
        pending: false,
        setFilters: values => pushParams(withFilterSelection(currentParams(), values, filterOptions, defaultFilterValues)),
        setBody: bodyId => pushParams(withBodySelection(currentParams(), bodyId, bodyOptionsForSelection(view.selectedFilters, bodyOptionsFor))),
        setPage: nextPage => pushParams(withPage(currentParams(), nextPage)),
        hrefForPage: target => `?${withPage(currentParams(), target).toString()}`,
    };
}
