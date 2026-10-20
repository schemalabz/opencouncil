import type { CollectionState } from './types';

/** A collection that shows the rows it is given: no search, no filter, one page. */
export function fixedCollection<T, F = string | undefined>(rows: T[]): CollectionState<T, F> {
    return {
        rows,
        total: rows.length,
        page: 1,
        totalPages: 1,
        search: null,
        selectedFilters: [],
        selectedBody: null,
        pending: false,
        setFilters: () => {},
        setBody: () => {},
        setPage: () => {},
        hrefForPage: () => '?',
    };
}
