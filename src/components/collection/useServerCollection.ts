"use client";
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
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
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useQueryParamState';
import { totalPagesOf } from '@/lib/zod-schemas/listQuery';
import type { CollectionState } from './types';

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
    bodyOptionsFor,
}: ServerCollectionInput<T, F>): CollectionState<T, F> {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [pending, startTransition] = useTransition();
    const committed = searchParams.toString();

    // The URL the reader last asked for, while its navigation loads; the URL on
    // screen otherwise. A navigation lands a server round trip later, and the
    // reader may change something else meanwhile: a new URL builds on this one,
    // not on the one on screen, or it would drop the change still loading. The
    // router commits only its latest navigation, so one value is enough.
    const [shown, setShown] = useOptimistic(committed);
    const latestParams = useMemo(() => new URLSearchParams(shown), [shown]);

    // The controls show what the reader picked; the rows and the total stay
    // those on screen, dimmed, until the new ones arrive.
    const view = parseCollectionParams<F>(latestParams, {
        filterOptions,
        defaultFilterValues,
        bodyOptionsFor,
    });

    const [query, setQuery] = useState(view.query);

    // The URL this source last asked for. When it lands, the box may hold newer
    // text that the debounce has not written yet, so the box stays. Any other
    // URL comes from Back, Forward or a link, even one with the same search,
    // and the box follows it: text not yet written must not reach that entry.
    const sentUrl = useRef(committed);
    useEffect(() => {
        if (committed === sentUrl.current) return;
        sentUrl.current = committed;
        setQuery(searchParams.get('search') || '');
    }, [committed, searchParams]);

    const navigate = useCallback((params: URLSearchParams, mode: 'push' | 'replace') => {
        const queryString = params.toString();
        if (queryString === shown) return;
        sentUrl.current = queryString;
        const href = queryString ? `${pathname}?${queryString}` : pathname;
        startTransition(() => {
            setShown(queryString);
            if (mode === 'push') {
                router.push(href, { scroll: false });
            } else {
                router.replace(href, { scroll: false });
            }
        });
    }, [shown, setShown, pathname, router]);

    // A typed letter is not a step back to return to, so the search replaces
    // the history entry. A filter, a body or a page is, so those push.
    useEffect(() => {
        if (query === (latestParams.get('search') || '')) return;
        const timeoutId = setTimeout(() => navigate(withSearchQuery(latestParams, query), 'replace'), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timeoutId);
    }, [query, latestParams, navigate]);

    // A filter or a body picked before the debounce takes the typed text with
    // it. Otherwise the debounce would then replace the entry that the pick
    // pushed, and Back would skip the pick.
    const withTypedSearch = () => withSearchQuery(latestParams, query);

    return {
        rows,
        total,
        page: pending ? view.page : page,
        totalPages: totalPagesOf(total, pageSize),
        search: { query, setQuery },
        selectedFilters: view.selectedFilters,
        selectedBody: view.selectedBody,
        pending,
        setFilters: values => navigate(withFilterSelection(withTypedSearch(), values, filterOptions, defaultFilterValues), 'push'),
        setBody: bodyId => navigate(withBodySelection(withTypedSearch(), bodyId, bodyOptionsForSelection(view.selectedFilters, bodyOptionsFor)), 'push'),
        setPage: nextPage => navigate(withPage(latestParams, nextPage), 'push'),
        hrefForPage: target => `?${withPage(latestParams, target).toString()}`,
    };
}
