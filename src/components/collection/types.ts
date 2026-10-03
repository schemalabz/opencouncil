/**
 * What a collection view draws, and the actions it can take.
 *
 * The same shape whichever source fills it. A bounded set loaded through props
 * (people, parties) uses the local source, which filters, searches and pages in
 * the browser. A set that grows without limit (meetings) uses the server source,
 * where the page loads only the rows on screen. The view never knows which.
 */
export interface CollectionState<T, F> {
    /** This page's rows: already filtered, searched, sorted and paged. */
    rows: T[];
    /** The separate group under the grid (former members). Empty for most lists. */
    trailingRows: T[];
    /** Every matching row across all pages. The number that the count line prints. */
    total: number;
    page: number;
    totalPages: number;
    /** The search box text. It can be ahead of the URL while the debounce waits. */
    query: string;
    selectedFilters: F[];
    selectedBody: string | null;
    /** True while a server page loads. Always false for the local source. */
    pending: boolean;
    /** Whether the source applies a search. The view hides the search box when it does not. */
    searchable: boolean;
    /**
     * The local source fetched a capped window and nothing narrows it, so the
     * count names the window. Temporary: removed when the meetings tab pages
     * on the server, which is the only capped list.
     */
    capped: boolean;
    setQuery(query: string): void;
    setFilters(values: F[]): void;
    setBody(bodyId: string | null): void;
    setPage(page: number): void;
    hrefForPage(page: number): string;
}

/** How long the search box waits before it writes the URL. */
export const SEARCH_DEBOUNCE_MS = 300;
