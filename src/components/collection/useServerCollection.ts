"use client";
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
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

export type ServerCollectionInput<T, F> = CollectionFilterConfig<F> & {
    /** The rows of the current page, as the server page loaded them. */
    rows: T[];
    /** Every matching row across all pages. */
    total: number;
    /** The page the server loaded, already clamped to the last page. */
    page: number;
    pageSize: number;
};

/**
 * A collection that the server page loads one page at a time.
 *
 * The URL holds the view, as in the local source. A change goes through the
 * router, so the server page reads the new parameters and loads the new rows.
 * The change runs in a transition: the rows on screen stay until the new rows
 * arrive, and `pending` is true meanwhile.
 */
export function useServerCollection<T, F>({
    rows,
    total,
    page,
    pageSize,
    filterOptions,
    defaultFilterValues,
    unsetMeansEveryValue,
    bodyOptionsFor,
}: ServerCollectionInput<T, F>): CollectionState<T, F> {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [pending, startTransition] = useTransition();
    const committed = searchParams.toString();

    // The URLs this source asked the router for that have not landed yet,
    // oldest first. A navigation lands a server round trip later, and the
    // reader may change something else meanwhile. A new URL builds on the
    // latest one requested, not on the one on screen, or it would drop the
    // change still loading.
    const [requested, setRequested] = useState<string[]>([]);
    const latestParams = useMemo(
        () => new URLSearchParams(requested.at(-1) ?? committed),
        [requested, committed]
    );

    // While a change loads, the controls and the pager show what the reader
    // picked; the rows and the total stay those on screen, dimmed. A second
    // click on Next then counts from the page already asked for.
    const view = parseCollectionParams<F>(pending ? latestParams : searchParams, {
        filterOptions,
        defaultFilterValues,
        unsetMeansEveryValue,
        bodyOptionsFor,
    });

    const [query, setQuery] = useState(view.query);

    useEffect(() => {
        // The router commits only the latest of equal requests, so the
        // match is the last one: an earlier copy would leave a stale entry.
        const index = requested.lastIndexOf(committed);
        if (index !== -1) {
            // One of this source's own navigations landed. The search box
            // already holds the reader's text, which may be newer.
            setRequested(requested.slice(index + 1));
            return;
        }
        // A navigation this source did not make: Back, Forward or a link.
        if (requested.length > 0) setRequested([]);
        const urlQuery = searchParams.get('search') || '';
        if (urlQuery !== query) setQuery(urlQuery);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const navigate = useCallback((params: URLSearchParams, mode: 'push' | 'replace') => {
        const queryString = params.toString();
        if (queryString === latestParams.toString()) return;
        // The router commits only its latest navigation. A return to the URL
        // on screen changes no search params, so no effect would clear the
        // requests that it replaces.
        setRequested(previous => (queryString === committed ? [] : [...previous, queryString]));
        const href = queryString ? `${pathname}?${queryString}` : pathname;
        startTransition(() => {
            if (mode === 'push') {
                router.push(href, { scroll: false });
            } else {
                router.replace(href, { scroll: false });
            }
        });
    }, [committed, latestParams, pathname, router]);

    // A typed letter is not a step back to return to, so the search replaces
    // the history entry. A filter, a body or a page is, so those push.
    useEffect(() => {
        if (query === (latestParams.get('search') || '')) return;
        const timeoutId = setTimeout(() => navigate(withSearchQuery(latestParams, query), 'replace'), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timeoutId);
    }, [query, latestParams, navigate]);

    return {
        rows,
        trailingRows: [],
        total,
        page: pending ? view.page : page,
        totalPages: Math.ceil(total / pageSize),
        query,
        selectedFilters: view.selectedFilters,
        selectedBody: view.selectedBody,
        pending,
        searchable: true,
        capped: false,
        setQuery,
        setFilters: values => navigate(withFilterSelection(latestParams, values, filterOptions, defaultFilterValues), 'push'),
        setBody: bodyId => navigate(withBodySelection(latestParams, bodyId, bodyOptionsForSelection(view.selectedFilters, bodyOptionsFor)), 'push'),
        setPage: nextPage => navigate(withPage(latestParams, nextPage), 'push'),
        hrefForPage: target => `?${withPage(latestParams, target).toString()}`,
    };
}
