"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { normalizeText } from '@/lib/utils';
import {
    bodyOptionsForSelection,
    parseCollectionParams,
    withBodySelection,
    withFilterSelection,
    withPage,
    withSearchQuery,
    type CollectionFilterConfig,
} from '@/lib/utils/filterURL';
import { SEARCH_DEBOUNCE_MS, type CollectionState } from './types';

/** The filter configuration is optional here: a list with no filter passes none of it. */
export type LocalCollectionOptions<T, F> = Partial<CollectionFilterConfig<F>> & {
    filter?: (selectedValues: F[], item: T, selectedBody: string | null) => boolean;
    /** Default true. The subject carousel turns it off. */
    searchable?: boolean;
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
    /**
     * Items listed after all the others, under their own heading — the people
     * who no longer hold a role, say. They pass the same search and filter and
     * count in the total; they only stop sharing the grid.
     */
    trailing?: (item: T) => boolean;
    /** Rows per page. Without it, every row is on one page. */
    pageSize?: number;
    /**
     * The page fetched at most this many rows. When the cap actually binds and
     * nothing is filtering, the count names the window instead of reporting the
     * fetch limit as the collection's own total.
     */
    cappedAt?: number;
};

/** A collection loaded whole through props: filtered, searched and paged in the browser. */
export function useLocalCollection<T extends { id: string }, F = string | undefined>(
    items: T[],
    {
        filterOptions = [],
        defaultFilterValues,
        unsetMeansEveryValue = true,
        bodyOptionsFor,
        filter,
        searchable = true,
        searchKeys,
        sortItems,
        trailing,
        pageSize,
        cappedAt,
    }: LocalCollectionOptions<T, F> = {},
): CollectionState<T, F> {
    const searchParams = useSearchParams();
    const view = parseCollectionParams<F>(searchParams, { filterOptions, defaultFilterValues, unsetMeansEveryValue, bodyOptionsFor });

    const [query, setQuery] = useState(view.query);

    // Sync the search text with the URL on browser back/forward navigation.
    useEffect(() => {
        const urlQuery = searchParams.get('search') || '';
        if (urlQuery !== query) setQuery(urlQuery);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // One normalized haystack per row, so a keystroke costs a substring scan
    // rather than a re-normalization of every name in the city.
    const searchIndex = useMemo(() => {
        if (!searchable) return null;
        return new Map(items.map(item => {
            const values = searchKeys
                ? searchKeys(item)
                : Object.values(item).filter((value): value is string => typeof value === 'string');
            return [item.id, normalizeText(values.filter(Boolean).join(' '))];
        }));
    }, [items, searchKeys, searchable]);

    // Every word has to match, so "μαρια παπα" finds "Μαρία Παπαδοπούλου"
    // whichever order the reader types the two parts of the name in.
    const searchTerms = useMemo(() => normalizeText(query).split(/\s+/).filter(Boolean), [query]);

    const matchingItems = items.filter(item => {
        if (searchIndex && searchTerms.length > 0) {
            const haystack = searchIndex.get(item.id) ?? '';
            if (!searchTerms.every(term => haystack.includes(term))) return false;
        }
        if (filter) return filter(view.selectedFilters, item, view.selectedBody);
        return true;
    });
    const filteredItems = sortItems ? sortItems(matchingItems, view.selectedFilters, view.selectedBody) : matchingItems;

    // Only while the cap binds and nothing narrows the list: under a filter the
    // count describes the rows on screen, which is the useful number and not a
    // claim about the collection.
    const capped = cappedAt != null && items.length >= cappedAt && filteredItems.length === items.length;

    // A query the debounce below has not written yet already narrows the list,
    // so honouring the URL's page here would show page 4 of the old result set.
    const searchPending = query !== view.query;
    const requestedPage = searchPending ? 1 : view.page;
    const totalPages = pageSize ? Math.ceil(filteredItems.length / pageSize) : 1;
    const page = Math.max(1, Math.min(requestedPage, totalPages));
    const pagedItems = pageSize
        ? filteredItems.slice((page - 1) * pageSize, page * pageSize)
        : filteredItems;
    const rows = trailing ? pagedItems.filter(item => !trailing(item)) : pagedItems;
    const trailingRows = trailing ? pagedItems.filter(trailing) : [];

    // Debounced URL update for search
    useEffect(() => {
        if (!searchable) return;

        // Avoid overriding pagination/filter URL changes when the search value didn't change.
        const urlQuery = searchParams.get('search') || '';
        if (query === urlQuery) return;

        const timeoutId = setTimeout(() => {
            const params = withSearchQuery(new URLSearchParams(searchParams.toString()), query);
            window.history.replaceState(null, '', `?${params.toString()}`);
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timeoutId);
    }, [query, searchParams, searchable]);

    const currentParams = useCallback(() => new URLSearchParams(searchParams.toString()), [searchParams]);
    const pushParams = useCallback((params: URLSearchParams) => {
        window.history.pushState(null, '', `?${params.toString()}`);
    }, []);

    return {
        rows,
        trailingRows,
        total: filteredItems.length,
        page,
        totalPages,
        query,
        selectedFilters: view.selectedFilters,
        selectedBody: view.selectedBody,
        pending: false,
        searchable,
        capped,
        setQuery,
        setFilters: values => pushParams(withFilterSelection(currentParams(), values, filterOptions, defaultFilterValues)),
        setBody: bodyId => pushParams(withBodySelection(currentParams(), bodyId, bodyOptionsForSelection(view.selectedFilters, bodyOptionsFor))),
        setPage: nextPage => pushParams(withPage(currentParams(), nextPage)),
        hrefForPage: target => `?${withPage(currentParams(), target).toString()}`,
    };
}
