"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/routing";
import { SearchInputPill } from "@/components/ui/search-input-pill";
import { SEARCH_FIELD_STYLE } from "@/lib/landing/landingCore";
import { FilterIconButton } from "@/components/landing/v2/controls";
import SearchFilters from "./SearchFilters";
import SearchFilterSections from "./SearchFilterSections";
import {
    DERIVED_FILTER_PARAM,
    DERIVED_FILTER_PARAMS,
    filterDateRangeToInstants,
    formatFilterDate,
    hasActiveSearchFilters,
    parseDerivedKeys,
    parseFilterDate,
    serializeDerivedKeys,
    type DerivedFilterKey,
    type SearchFilterParams,
} from "./searchFilterTypes";
import { useSearchFilterData } from "./hooks/useSearchFilterData";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { SearchResultLight, search as searchFn } from "@/lib/search";
import { useRouter, useSearchParams } from 'next/navigation';
import { getCity } from "@/lib/db/cities";
import { getPerson } from "@/lib/db/people";
import { getParty } from "@/lib/db/parties";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SubjectListContainer } from "@/components/subject/SubjectListContainer";
import { getPartyFromRoles } from "@/lib/utils";
import { toAdministrativeBodyType } from "@/lib/utils/administrativeBodies";
import { useTranslations } from 'next-intl';
import posthog from "posthog-js";

const PAGE_SIZE = 15;
const SEARCH_DELAY = 500;

// Temporary flag to disable search functionality
const SEARCH_TEMPORARILY_DISABLED = false;

export default function SearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    // The last query persisted to the search log, so that filter and page
    // changes re-executing the same query don't log the same intent again.
    const lastLoggedQueryRef = useRef<string | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    // The filter panel is a full-screen layer; without this the results list
    // scrolls behind it and the page rubber-bands on iOS. The lock is gated on
    // the same `md` breakpoint that hides the overlay (see globals.css), so
    // widening the viewport releases it through the cascade rather than through
    // a resize listener.
    useBodyScrollLock(filtersOpen);
    const t = useTranslations('Common');
    const ts = useTranslations('search');
    const tf = useTranslations('search.filters');

    // Get all search parameters from URL
    const query = searchParams.get('query') || "";
    const cityId = searchParams.get('cityId') || undefined;
    const personId = searchParams.get('personId') || undefined;
    const partyId = searchParams.get('partyId') || undefined;
    const adminBodyType = searchParams.get('adminBodyType') || undefined;
    const adminBodyId = searchParams.get('adminBodyId') || undefined;
    const topicIds = searchParams.get('topicIds') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    // Which of the filters above the query text supplied, rather than the
    // reader choosing. Kept as a string until it is needed, so the memo below
    // is keyed on something stable.
    const derivedParam = searchParams.get(DERIVED_FILTER_PARAM) || undefined;
    const derivedKeys = useMemo(() => parseDerivedKeys(derivedParam), [derivedParam]);

    const filters = useMemo<SearchFilterParams>(
        () => ({ cityId, personId, partyId, adminBodyType, adminBodyId, topicIds, dateFrom, dateTo }),
        [cityId, personId, partyId, adminBodyType, adminBodyId, topicIds, dateFrom, dateTo]
    );

    // Local state for search input
    const [localQuery, setLocalQuery] = useState(query);

    // State for search results
    const [state, setState] = useState<{
        results: SearchResultLight[];
        total: number;
        isLoading: boolean;
        error: Error | null;
    }>({
        results: [],
        total: 0,
        isLoading: false,
        error: null
    });

    // Update URL parameters
    const updateSearchParams = useCallback((updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());

        // A derived filter belongs to the query that produced it, and only
        // until one of two things happens.
        const derived = parseDerivedKeys(params.get(DERIVED_FILTER_PARAM));
        let stillDerived: DerivedFilterKey[];
        if ('query' in updates) {
            // New text to read: drop the previous query's filters, values and
            // all, so the next extraction is not fenced in by the last one's
            // answer. Keyed on the key being present, not on its value —
            // clearing the box is a new query too.
            for (const key of derived) {
                for (const param of DERIVED_FILTER_PARAMS[key]) params.delete(param);
            }
            stillDerived = [];
        } else {
            // The reader set or cleared the filter by hand: it is theirs now,
            // so it survives the next query instead of being re-derived.
            stillDerived = derived.filter(
                key => !DERIVED_FILTER_PARAMS[key].some(param => param in updates)
            );
        }
        const derivedParam = serializeDerivedKeys(stillDerived);
        if (derivedParam) params.set(DERIVED_FILTER_PARAM, derivedParam);
        else params.delete(DERIVED_FILTER_PARAM);

        // Update or remove parameters
        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === '') {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });

        // Any change other than paging itself invalidates the current page.
        // Keyed on which keys were passed, not on their values: clearing a filter
        // passes `undefined`, and that has to reset the page just like setting one.
        const changesFilters = Object.keys(updates).some(key => key !== 'page');
        if (changesFilters) {
            params.set('page', '1');
        }

        // Remove empty parameters
        for (const [key, value] of params.entries()) {
            if (!value) {
                params.delete(key);
            }
        }

        // Refining a search replaces the current entry; paging pushes a new one.
        // Every pill click and every debounced keystroke goes through here, so
        // pushing them all buried the entry the user arrived from: leaving
        // /search took one Back press per filter they had touched. Paging still
        // pushes, so Back returns to the previous page of results.
        const href = `?${params.toString()}`;
        if (changesFilters) {
            router.replace(href, { scroll: false });
        } else {
            router.push(href, { scroll: false });
        }
    }, [router, searchParams]);

    /**
     * Put what the query text supplied onto the filter pills, so the reader can
     * see the search narrowed itself, share the link with the narrowing intact,
     * and take it off.
     *
     * Deliberately not routed through `updateSearchParams`: that function reads
     * an incoming filter param as the reader claiming the filter, which is the
     * opposite of what this is. `replace`, not `push`, because this refines the
     * search the reader just ran rather than starting another one — a Back
     * press should leave the results, not peel the pills off them.
     */
    const applyDerivedFilters = useCallback((
        updates: Record<string, string | undefined>,
        keys: DerivedFilterKey[]
    ) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (value) params.set(key, value);
            else params.delete(key);
        });
        const derivedParam = serializeDerivedKeys(keys);
        if (derivedParam) params.set(DERIVED_FILTER_PARAM, derivedParam);
        router.replace(`?${params.toString()}`, { scroll: false });
    }, [router, searchParams]);

    /**
     * The search whose results are on screen, as the filters it actually ran
     * with. Writing derived filters into the URL re-runs the search effect with
     * the same effective search — the derived values are simply explicit params
     * now — so without this the page would search twice, and flicker, for every
     * query the model reads a filter out of.
     */
    const executedSearchRef = useRef<string | null>(null);

    /**
     * The query text already read for filters. Taking a derived filter off is a
     * decision — "yes it says Χανιά, search everywhere anyway" — and clearing
     * the pill un-marks it, so without this the next search would read the same
     * text and put it straight back, leaving the pill impossible to remove.
     *
     * A reload starts over and derives again. That is the right default for
     * someone arriving at the link fresh; it just does not remember a decision
     * the previous reader made.
     */
    const extractedQueryRef = useRef<string | null>(null);

    // One instance for both filter surfaces. They are mounted together (the
    // desktop bar is hidden with CSS, not unmounted), so a hook call inside each
    // would fetch every list twice.
    const filterData = useSearchFilterData(filters, updateSearchParams);

    // Debounced URL update for search
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (localQuery !== query) {
                updateSearchParams({ query: localQuery || undefined });
            }
        }, SEARCH_DELAY);

        return () => clearTimeout(timeoutId);
    }, [localQuery, query, updateSearchParams]);

    // Every run claims the next id, and only the newest one may write to state.
    // Filter extraction is an AI call, so a request started earlier can finish
    // later: without this, checking two topics in quick succession could leave
    // the results of the first on screen while the filter bar shows both.
    const searchRunIdRef = useRef(0);

    // Perform search
    const performSearch = useCallback(async () => {
        // An unknown adminBodyType in a hand-edited URL is dropped rather
        // than sent: the pill leaves it unlabelled, so filtering on it would
        // empty the results with nothing on screen to explain why.
        const adminBodyTypeFilter = toAdministrativeBodyType(adminBodyType);
        const requestedCityIds = cityId ? [cityId] : undefined;
        const requestedDateRange = filterDateRangeToInstants(dateFrom, dateTo);
        const searchedWith = (cityIds?: string[], dateRange?: { start: string; end: string }) =>
            JSON.stringify([query, cityIds, personId, partyId, adminBodyId, adminBodyTypeFilter, topicIds, dateRange, page]);

        // Already ran this exact search — see executedSearchRef. Checked before
        // the run id below is claimed, because skipping a search is not the same
        // as superseding one: taking the id here would strip the current run
        // from a request still in flight, which would then finish, find itself
        // stale, discard its own results, and leave nothing to replace them.
        if (query && executedSearchRef.current === searchedWith(requestedCityIds, requestedDateRange)) return;

        const runId = ++searchRunIdRef.current;
        const isCurrentRun = () => runId === searchRunIdRef.current;
        // The marker describes a search that has already finished, so starting
        // another one makes it stale. Left set, a later pass could match it and
        // skip a search this one is about to contradict: clear a derived filter
        // and restore it while the first change is still in flight, and the
        // results that land are the unfiltered ones, under a pill saying
        // otherwise.
        executedSearchRef.current = null;

        // Skip search if temporarily disabled
        if (SEARCH_TEMPORARILY_DISABLED) {
            setState(prev => ({ ...prev, results: [], total: 0, isLoading: false }));
            return;
        }

        if (!query) {
            // Clearing the search box ends the intent: re-submitting the same
            // query afterwards should be logged as a new search — and read for
            // filters again, since clearing the box took the filters the last
            // extraction supplied off the URL with it.
            lastLoggedQueryRef.current = null;
            executedSearchRef.current = null;
            extractedQueryRef.current = null;
            setState(prev => ({ ...prev, results: [], total: 0 }));
            return;
        }

        const shouldExtract = derivedKeys.length === 0 && extractedQueryRef.current !== query;

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        const startedAt = performance.now();

        try {
            // Only the database log dedupes repeats of one query — it is a record
            // of what people look for, not of what the page did.
            const skipQueryLog = lastLoggedQueryRef.current === query;
            lastLoggedQueryRef.current = query;

            const response = await searchFn({
                query,
                cityIds: requestedCityIds,
                personIds: personId ? [personId] : undefined,
                partyIds: partyId ? [partyId] : undefined,
                adminBodyIds: adminBodyId ? [adminBodyId] : undefined,
                adminBodyTypes: adminBodyTypeFilter ? [adminBodyTypeFilter] : undefined,
                topicIds: topicIds ? topicIds.split(',').filter(Boolean) : undefined,
                dateRange: requestedDateRange,
                config: {
                    enableSemanticSearch: true,
                    // Read the query text for filters once per query: after
                    // that, what it gave is in the URL and on the pills, and
                    // what the reader took off should stay off.
                    extractFilters: shouldExtract,
                    enableHighlights: true,
                    size: PAGE_SIZE,
                    from: (page - 1) * PAGE_SIZE,
                    detailed: false
                }
            }, { skipQueryLog });

            if (!isCurrentRun()) return;

            if (shouldExtract) extractedQueryRef.current = query;

            const { cityIds: derivedCityIds, dateRange: derivedRange } = response.derivedFilters;

            // Show what the query text supplied. A derived location has no
            // filter on this page to land on, so it stays unshown — it only
            // boosts proximity, it does not narrow the results.
            const derivedUpdates: Record<string, string | undefined> = {};
            const newlyDerived: DerivedFilterKey[] = [];
            if (derivedCityIds?.[0]) {
                derivedUpdates.cityId = derivedCityIds[0];
                newlyDerived.push('city');
            }
            if (derivedRange) {
                const from = parseFilterDate(derivedRange.start);
                const to = parseFilterDate(derivedRange.end);
                if (from && to) {
                    derivedUpdates.dateFrom = formatFilterDate(from);
                    derivedUpdates.dateTo = formatFilterDate(to);
                    newlyDerived.push('date');
                }
            }

            // Record what this search actually ran with, so the pass that
            // follows the URL write can tell whether it would be asking the
            // same question.
            //
            // A derived date usually means it would not. The model answers with
            // a range of its own, while the URL carries a calendar day and
            // reads back local day edges — rarely the same instants. The second
            // search is the correction for that, not waste: recording the URL's
            // interval here instead would suppress it and leave the results on
            // screen describing one period while the pill and the shareable
            // link claim another.
            //
            // The city is the whole derived list for the same reason: only its
            // first entry reaches the URL, so a query naming two municipalities
            // searches again, narrowed to the one the pill shows.
            executedSearchRef.current = searchedWith(
                derivedCityIds ?? requestedCityIds,
                requestedDateRange ?? derivedRange,
            );

            setState({
                results: response.results,
                total: response.total,
                isLoading: false,
                error: null
            });

            if (newlyDerived.length > 0) {
                applyDerivedFilters(derivedUpdates, newlyDerived);
            }

            // Every execution, not every distinct query. This used to ride the
            // database log's dedup flag, so changing a filter or turning a page
            // — both real searches, with different results — recorded nothing,
            // and the filter flags below described only a query's first run.
            posthog.capture("search_performed", {
                query_length: query.length,
                page,
                has_city_filter: !!cityId,
                has_person_filter: !!personId,
                has_party_filter: !!partyId,
                has_admin_body_filter: !!(adminBodyType || adminBodyId),
                has_topic_filter: !!topicIds,
                has_date_filter: !!(dateFrom || dateTo),
                derived: newlyDerived,
                results_count: response.total,
                duration_ms: Math.round(performance.now() - startedAt),
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error('An error occurred during search');
            // A superseded run's failure says nothing about the search on
            // screen, so it must not replace its results with an error page —
            // nor report an exception for something no reader ever saw.
            if (!isCurrentRun()) return;
            posthog.captureException(err);
            // Without this a failed search and one that matched nothing are the
            // same event with results_count 0.
            posthog.capture("search_failed", {
                query_length: query.length,
                page,
                duration_ms: Math.round(performance.now() - startedAt),
            });
            setState(prev => ({ ...prev, error, isLoading: false }));
            toast({
                variant: "destructive",
                title: "Search Error",
                description: error.message
            });
            console.error('Search error:', err);
        }
    }, [query, cityId, personId, partyId, adminBodyType, adminBodyId, topicIds, dateFrom, dateTo, page, derivedKeys, applyDerivedFilters, toast]);

    // Search when URL parameters change
    useEffect(() => {
        performSearch();
    }, [performSearch]);

    // Reconcile the identity filters in the URL against the database: drop ids
    // that no longer resolve, and fill in the city (and party) a person or party
    // id implies. Runs only when one of those three ids actually changes.
    //
    // `updateSearchParams` and `toast` are held in refs rather than listed as
    // dependencies: `updateSearchParams` is rebuilt from `searchParams`, so
    // depending on it re-ran this on every URL change — three server round trips
    // per pagination click, purely to re-derive values that had not moved.
    const updateSearchParamsRef = useRef(updateSearchParams);
    const toastRef = useRef(toast);
    useEffect(() => {
        updateSearchParamsRef.current = updateSearchParams;
        toastRef.current = toast;
    });

    useEffect(() => {
        let live = true;
        const fetchInitialFilterData = async () => {
            try {
                const updates: Record<string, string | undefined> = {};

                if (cityId) {
                    const city = await getCity(cityId);
                    if (!city) updates.cityId = undefined;
                }

                if (personId) {
                    const person = await getPerson(personId);
                    if (person) {
                        updates.personId = person.id;
                        updates.cityId = person.cityId;
                        const party = getPartyFromRoles(person.roles);
                        updates.partyId = party?.id ?? undefined;
                    } else {
                        updates.personId = undefined;
                    }
                }

                if (partyId) {
                    const party = await getParty(partyId);
                    if (party) {
                        updates.partyId = party.id;
                        updates.cityId = party.cityId;
                    } else {
                        updates.partyId = undefined;
                    }
                }

                // A newer set of ids superseded this run while it was in flight;
                // its answers describe filters that are no longer on screen.
                if (!live) return;

                // Push only genuine changes. Pushing the already-current values
                // would reset the page to 1 on each paginate and pin the results
                // to page 1 forever.
                const current: Record<string, string | undefined> = { cityId, personId, partyId };
                const changed = Object.fromEntries(
                    Object.entries(updates).filter(([key, value]) => value !== current[key])
                );

                if (Object.keys(changed).length > 0) {
                    updateSearchParamsRef.current(changed);
                }
            } catch (err) {
                if (!live) return;
                console.error('Error fetching initial filter data:', err);
                toastRef.current({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to load filter data"
                });
            }
        };

        fetchInitialFilterData();
        return () => { live = false; };
    }, [cityId, personId, partyId]);

    const totalPages = Math.ceil(state.total / PAGE_SIZE);

    // Memoize the grid of results
    const resultsGrid = useMemo(() => (
        <SubjectListContainer
            subjects={state.results}
            // Rank across the whole result set, not the page — a click at rank 1
            // and a click at rank 40 say different things about the ranking, and
            // that is the point of recording it at all.
            onSubjectOpen={(subject, index) => posthog.capture("search_result_opened", {
                query_length: query.length,
                rank: (page - 1) * PAGE_SIZE + index,
                subject_id: subject.id,
                city_id: subject.cityId,
            })}
            layout="list"
            variant="row"
            showContext={true}
            openInNewTab={true}
        />
    ), [state.results]);

    return (
        // data-stable-scrollbar-gutter: results arriving make the page scroll, and the
        // classic scrollbar that browsers on Windows and Linux then show would narrow
        // the viewport and shift this centred column left. See globals.css.
        <div
            data-stable-scrollbar-gutter
            className="flex flex-col gap-6 max-w-7xl mx-auto px-4 py-8"
        >
            {/* Home affordance — the search page otherwise has no obvious way
                back; a user resorted to hand-editing the URL (#405). Real
                navigational <Link>, keyboard-focusable with a visible focus
                ring (#293). */}
            <div>
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t('backToHome')}</span>
                </Link>
            </div>

            {/* Temporary maintenance message */}
            {SEARCH_TEMPORARILY_DISABLED && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                        <div>
                            <h3 className="font-medium text-amber-800">{ts('maintenanceTitle')}</h3>
                            <p className="text-sm text-amber-700 mt-1">
                                {ts('maintenanceBody')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-4">
                {/* In normal page flow — the bar scrolls away with the results. Desktop keeps
                    the inline pill row (SearchFilters); mobile collapses the same fields behind
                    a filter icon that opens a full-screen overlay (SearchFilterSections), since
                    a row of pills has to scroll sideways on a narrow screen.

                    The split is a CSS breakpoint (md, 768px — same value as useIsMobile), not a
                    JS check: a JS check renders the desktop bar in the SSR HTML, and a phone on
                    a slow connection shows that until hydration completes. */}
                <div className="pb-3 pt-2">
                    <div className="mx-auto w-full max-w-6xl">
                        <div className="flex items-center gap-2">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!SEARCH_TEMPORARILY_DISABLED) {
                                        updateSearchParams({ query: localQuery });
                                    }
                                }}
                                className="relative flex-1"
                            >
                                <SearchInputPill
                                    value={localQuery}
                                    onChange={setLocalQuery}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (!SEARCH_TEMPORARILY_DISABLED) {
                                                updateSearchParams({ query: localQuery });
                                            }
                                        }
                                    }}
                                    placeholder={SEARCH_TEMPORARILY_DISABLED ? ts('placeholderDisabled') : ts('placeholder')}
                                    ariaLabel={t('search')}
                                    clearAriaLabel={ts('clearQuery')}
                                    inputRef={searchInputRef}
                                    disabled={SEARCH_TEMPORARILY_DISABLED}
                                    size="lg"
                                    className="shadow-lg"
                                    style={SEARCH_FIELD_STYLE}
                                />
                            </form>
                            <div className="shrink-0 md:hidden">
                                <FilterIconButton
                                    active={hasActiveSearchFilters(filters)}
                                    onClick={() => setFiltersOpen(true)}
                                    ariaLabel={tf('panelTitle')}
                                />
                            </div>
                        </div>

                        <SearchFilters
                            derivedKeys={derivedKeys}
                            className="mt-3 hidden md:flex"
                            filters={filters}
                            setFilters={updateSearchParams}
                            data={filterData}
                            disabled={SEARCH_TEMPORARILY_DISABLED}
                        />
                    </div>

                    {filtersOpen && (
                        <div className="fixed inset-0 z-[60] flex flex-col bg-background md:hidden">
                            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                                <button
                                    type="button"
                                    onClick={() => setFiltersOpen(false)}
                                    aria-label={tf('back')}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                </button>
                                <span className="text-base font-semibold text-foreground">{tf('panelTitle')}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                                <SearchFilterSections
                                    derivedKeys={derivedKeys}
                                    filters={filters}
                                    setFilters={updateSearchParams}
                                    data={filterData}
                                    disabled={SEARCH_TEMPORARILY_DISABLED}
                                />
                            </div>
                            <div className="flex shrink-0 items-center justify-end border-t border-border bg-card px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => setFiltersOpen(false)}
                                    className="rounded-xl bg-foreground px-6 py-2 text-sm font-semibold text-background transition hover:brightness-110"
                                >
                                    {ts('resultsCount', { count: state.total })}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Same max width as the search bar above, so the results column lines up with it. */}
                <div className="mx-auto w-full max-w-6xl">
                    {state.error ? (
                        <div className="flex justify-center items-center min-h-[400px]">
                            <div className="text-center space-y-3">
                                <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
                                <div className="text-destructive text-lg font-medium">{ts('errorTitle')}</div>
                                <p className="text-muted-foreground text-sm max-w-md">
                                    {ts('errorBody')}
                                </p>
                                <button
                                    onClick={() => router.push('/search')}
                                    className="px-4 py-2 rounded-md border bg-background hover:bg-accent transition-colors text-sm"
                                >
                                    {ts('backToSearch')}
                                </button>
                            </div>
                        </div>
                    ) : state.isLoading ? (
                        <div className="flex flex-col gap-4 mt-6">
                            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                                <Skeleton key={i} className="h-[136px] w-full rounded-lg" />
                            ))}
                        </div>
                    ) : !query ? (
                        <div className="flex justify-center items-center min-h-[400px]">
                            <div className="text-center space-y-2">
                                <div className="text-muted-foreground text-lg">{ts('welcomeTitle')}</div>
                                <p className="text-muted-foreground text-sm">
                                    {ts('welcomeBody')}
                                </p>
                            </div>
                        </div>
                    ) : state.results.length === 0 ? (
                        <div className="flex justify-center items-center min-h-[400px]">
                            <div className="text-center space-y-2">
                                <div className="text-muted-foreground text-lg">{ts('noResultsTitle')}</div>
                                <p className="text-muted-foreground text-sm">
                                    {ts('noResultsBody')}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mt-6">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-muted-foreground">
                                        {ts('resultsCount', { count: state.total })}
                                    </p>
                                </div>
                                {resultsGrid}
                            </div>
                            {totalPages > 1 && (
                                <div className="flex justify-center gap-2 mt-8">
                                    <button
                                        onClick={() => updateSearchParams({ page: (page - 1).toString() })}
                                        disabled={page === 1}
                                        className="px-4 py-2 rounded-md border bg-background hover:bg-accent disabled:opacity-50 disabled:hover:bg-background transition-colors"
                                    >
                                        {ts('previous')}
                                    </button>
                                    <div className="px-4 py-2 text-sm text-muted-foreground">
                                        {ts('pageOf', { page, total: totalPages })}
                                    </div>
                                    <button
                                        onClick={() => updateSearchParams({ page: (page + 1).toString() })}
                                        disabled={page === totalPages}
                                        className="px-4 py-2 rounded-md border bg-background hover:bg-accent disabled:opacity-50 disabled:hover:bg-background transition-colors"
                                    >
                                        {ts('next')}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
