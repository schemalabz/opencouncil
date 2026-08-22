import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapFilters } from '@/lib/landing/landingCore';
import type { GeneralCityRow, MapSubject } from '@/lib/landing/landingData';
import type { DerivedFilters } from '@/lib/search/types';
import { captureLanding } from '@/lib/landing/analytics';

/**
 * Filters the search read out of the query text, because the reader had not set
 * them — the arms of the server's own `DerivedFilters` the landing can show. A
 * derived location has no chip here to land on, so it stays out.
 */
export type DerivedSearchFilters = Pick<DerivedFilters, 'cityIds' | 'dateRange'>;

/** A search the reader committed: the result set, and how to order and describe it. */
export type CommittedSearch = {
    query: string;
    located: MapSubject[];
    general: GeneralCityRow[];
    /** Subject ids in relevance order — the list follows this, not the map ranking. */
    order: string[];
    total: number;
    /** More matched than one map can carry; `total` is what came back, not what matched. */
    truncated: boolean;
};

/**
 * Move the landing's own filters to match what the query text supplied.
 *
 * Shared with the hook rather than left to the caller alone: applying these
 * changes the filters the hook watches, and it has to recognise that as this
 * search settling rather than as a new one to run.
 */
export function applyDerivedFilters(filters: MapFilters, derived: DerivedSearchFilters): MapFilters {
    const cityId = derived.cityIds?.[0];
    const range = derived.dateRange;
    if (!cityId && !range) return filters;
    // The filters carry a calendar day; the search answers with an instant.
    const day = (iso: string) => iso.slice(0, 10);
    return {
        ...filters,
        cityIds: cityId ? [cityId] : filters.cityIds,
        dateFrom: range ? day(range.start) : filters.dateFrom,
        dateTo: range ? day(range.end) : filters.dateTo,
    };
}

type Args = {
    cats: string[];
    filters: MapFilters;
    /**
     * What the query text supplied that the reader had not. Called once per
     * commit, so the landing can move its own chips to match rather than
     * narrowing the map behind them.
     */
    onDerivedFilters: (derived: DerivedSearchFilters) => void;
};

function buildParams(query: string, cats: string[], filters: MapFilters, extract: boolean): string {
    const params = new URLSearchParams({ q: query });
    if (cats.length) params.set('topicIds', cats.join(','));
    if (filters.cityIds.length) params.set('cityIds', filters.cityIds.join(','));
    if (filters.bodyTypes.length) params.set('bodyType', filters.bodyTypes.join(','));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (!extract) params.set('extract', 'false');
    return params.toString();
}

/**
 * A committed search, held as the map's subject set.
 *
 * Committing swaps the map's three-month window for the search's own results,
 * so the pins, the list and the counts all describe the search. Changing a
 * filter afterwards re-runs it rather than narrowing what came back: the top
 * results for a category are not the results that happened to survive from the
 * top results for everything.
 */
export function useCommittedSearch({ cats, filters, onDerivedFilters }: Args) {
    const [committed, setCommitted] = useState<CommittedSearch | null>(null);
    const [pending, setPending] = useState(false);
    // The last request did not answer. Held apart from `committed`, which keeps
    // whatever the last successful one produced: the two together are what let
    // the panel say "these results are one filter out of date" instead of
    // showing a stale set as though it were the answer.
    const [failed, setFailed] = useState(false);
    // Only the newest request may write. Without this a slow first search can
    // land after a faster second one and put the wrong results on the map.
    const requestRef = useRef(0);
    // What the last request asked for, so the re-run effect below can tell a
    // filter actually changing from the state settling after a commit.
    const lastRunRef = useRef<string | null>(null);
    // The query the last request carried, so retrying does not need a committed
    // search to read it back from — the first search of all can fail too.
    const lastQueryRef = useRef<string | null>(null);

    const run = useCallback(async (
        query: string,
        extract: boolean,
        runCats: string[],
        runFilters: MapFilters,
    ) => {
        const id = ++requestRef.current;
        const startedAt = performance.now();
        lastRunRef.current = buildParams(query, runCats, runFilters, true);
        lastQueryRef.current = query;
        setPending(true);
        setFailed(false);
        try {
            const response = await fetch(`/api/map/search?${buildParams(query, runCats, runFilters, extract)}`);
            if (!response.ok) throw new Error(`Search failed: ${response.status}`);
            const data = await response.json();
            if (id !== requestRef.current) return;
            setCommitted({
                query,
                located: data.located ?? [],
                general: data.general ?? [],
                order: data.order ?? [],
                total: data.total ?? 0,
                truncated: Boolean(data.truncated),
            });
            if (extract) {
                // What a search cost and what it found. Without this, "the reader
                // got 12 results and opened none of them" is invisible, and every
                // argument about relevance stays an opinion.
                captureLanding('search_committed', {
                    query_length: query.length,
                    results: data.total ?? 0,
                    truncated: Boolean(data.truncated),
                    derived: Object.keys(data.derivedFilters ?? {}),
                    duration_ms: Math.round(performance.now() - startedAt),
                    has_category_filter: runCats.length > 0,
                    has_city_filter: runFilters.cityIds.length > 0,
                });
            }
            if (extract && data.derivedFilters) {
                onDerivedFilters(data.derivedFilters);
                // The caller is about to move its chips to match, which changes
                // the filters the re-run effect watches. Record where that
                // lands, so settling here doesn't read as a filter change.
                //
                // Only when the derivation lands whole. A query naming two
                // municipalities gets one chip, so the key is deliberately left
                // stale: the effect then re-runs under the filters the reader
                // can actually see, rather than leaving pins on the map from a
                // municipality nothing on screen names.
                if ((data.derivedFilters.cityIds?.length ?? 0) <= 1) {
                    lastRunRef.current = buildParams(query, runCats, applyDerivedFilters(runFilters, data.derivedFilters), true);
                }
            }
        } catch (error) {
            if (id !== requestRef.current) return;
            console.error('[Landing] Search failed:', error);
            setFailed(true);
            // Whatever the last successful run put on the map stays there.
            // Dropping the search instead swapped in the map's own recent
            // subjects under the reader's query text — a failure that reads as
            // an answer — and ended the search, which the re-run effect is gated
            // on, so no later filter change could retry it. Leaving the results
            // costs the reader a set that is one filter out of date; the next
            // filter change runs again, because lastRunRef still names the
            // request that failed.
        } finally {
            if (id === requestRef.current) setPending(false);
        }
    }, [onDerivedFilters]);

    /**
     * Run the search.
     *
     * `at` names the filters to run under, for a caller that knows them before
     * React does — restoring a shared link sets the filters and commits the
     * search in the same pass, and the state it just set is not readable yet.
     */
    const commit = useCallback((query: string, at?: { cats: string[]; filters: MapFilters }) => {
        const trimmed = query.trim();
        if (trimmed) void run(trimmed, true, at?.cats ?? cats, at?.filters ?? filters);
    }, [run, cats, filters]);

    const clear = useCallback(() => {
        requestRef.current++;
        lastRunRef.current = null;
        lastQueryRef.current = null;
        setCommitted(null);
        setPending(false);
        setFailed(false);
    }, []);

    /**
     * Run the last query again, under the filters as they stand now.
     *
     * The only other way back from a failure is changing a filter, which is a
     * change the reader did not want to make — and after a failed first search
     * there is no committed search for the re-run effect to work from at all.
     */
    const retry = useCallback(() => {
        const query = lastQueryRef.current;
        // Read the text again only if the last attempt never got an answer out
        // of it; a re-run failing means it was already read and applied.
        if (query) void run(query, !committed, cats, filters);
    }, [run, committed, cats, filters]);

    // Re-run when a filter changes under an active search. The query text has
    // already been read once, and what it gave is applied — reading it again
    // would buy a model call to derive what is already on screen.
    const activeQuery = committed?.query ?? null;
    useEffect(() => {
        if (!activeQuery) return;
        // The commit that produced these results already asked for exactly this.
        if (buildParams(activeQuery, cats, filters, true) === lastRunRef.current) return;
        void run(activeQuery, false, cats, filters);
        // `run` closes over the filters this is watching; depending on it here
        // would re-run on its identity rather than on a filter actually changing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuery, cats, filters]);

    return { committed, pending, failed, commit, clear, retry };
}
