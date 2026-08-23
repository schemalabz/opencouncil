"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/routing";
import { SearchInputPill } from "@/components/ui/search-input-pill";
import { SEARCH_FIELD_STYLE } from "@/lib/landing/landingCore";
import { FilterIconButton } from "@/components/landing/v2/controls";
import SearchFilters from "./SearchFilters";
import SearchFilterSections from "./SearchFilterSections";
import { filterDateRangeToInstants, hasActiveSearchFilters, type SearchFilterParams } from "./searchFilterTypes";
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
        const runId = ++searchRunIdRef.current;
        const isCurrentRun = () => runId === searchRunIdRef.current;

        // Skip search if temporarily disabled
        if (SEARCH_TEMPORARILY_DISABLED) {
            setState(prev => ({ ...prev, results: [], total: 0, isLoading: false }));
            return;
        }

        if (!query) {
            // Clearing the search box ends the intent: re-submitting the same
            // query afterwards should be logged as a new search.
            lastLoggedQueryRef.current = null;
            setState(prev => ({ ...prev, results: [], total: 0 }));
            return;
        }

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const skipQueryLog = lastLoggedQueryRef.current === query;
            lastLoggedQueryRef.current = query;

            // An unknown adminBodyType in a hand-edited URL is dropped rather
            // than sent: the pill leaves it unlabelled, so filtering on it would
            // empty the results with nothing on screen to explain why.
            const adminBodyTypeFilter = toAdministrativeBodyType(adminBodyType);

            const response = await searchFn({
                query,
                cityIds: cityId ? [cityId] : undefined,
                personIds: personId ? [personId] : undefined,
                partyIds: partyId ? [partyId] : undefined,
                adminBodyIds: adminBodyId ? [adminBodyId] : undefined,
                adminBodyTypes: adminBodyTypeFilter ? [adminBodyTypeFilter] : undefined,
                topicIds: topicIds ? topicIds.split(',').filter(Boolean) : undefined,
                dateRange: filterDateRangeToInstants(dateFrom, dateTo),
                config: {
                    enableSemanticSearch: true,
                    size: PAGE_SIZE,
                    from: (page - 1) * PAGE_SIZE,
                    detailed: false
                }
            }, { skipQueryLog });

            if (!isCurrentRun()) return;

            setState({
                results: response.results,
                total: response.total,
                isLoading: false,
                error: null
            });

            if (!skipQueryLog) {
                posthog.capture("search_performed", {
                    query_length: query.length,
                    has_city_filter: !!cityId,
                    has_person_filter: !!personId,
                    has_party_filter: !!partyId,
                    has_admin_body_filter: !!(adminBodyType || adminBodyId),
                    has_topic_filter: !!topicIds,
                    has_date_filter: !!dateFrom,
                    results_count: response.total,
                });
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error('An error occurred during search');
            posthog.captureException(err);
            // A superseded run's failure says nothing about the search on
            // screen, so it must not replace its results with an error page.
            if (!isCurrentRun()) return;
            setState(prev => ({ ...prev, error, isLoading: false }));
            toast({
                variant: "destructive",
                title: "Search Error",
                description: error.message
            });
            console.error('Search error:', err);
        }
    }, [query, cityId, personId, partyId, adminBodyType, adminBodyId, topicIds, dateFrom, dateTo, page, toast]);

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
