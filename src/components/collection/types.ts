/**
 * What a collection view draws, and the actions it can take.
 *
 * The same shape whichever source fills it. A bounded set loaded through props
 * (people, parties) uses the local source, which filters and searches in the
 * browser. A set that grows without limit (meetings) uses the server source,
 * where the page loads only the rows on screen. The view never knows which.
 */
export interface CollectionState<T, F> {
    /** The rows to draw: filtered, searched and sorted, and one page of them for a paged source. */
    rows: T[];
    /** Every matching row across all pages. The number that the count line prints. */
    total: number;
    page: number;
    totalPages: number;
    /** The search box, or null for a source without a search. Its query can be ahead of the URL while the debounce waits. */
    search: { query: string; setQuery(query: string): void } | null;
    selectedFilters: F[];
    selectedBody: string | null;
    /** True while a server page loads. Always false for the local source. */
    pending: boolean;
    setFilters(values: F[]): void;
    setBody(bodyId: string | null): void;
    setPage(page: number): void;
    hrefForPage(page: number): string;
}
