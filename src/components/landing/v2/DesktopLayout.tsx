'use client';

import { useEffect, useState } from 'react';
import { LocateFixed, Loader2, PanelLeftClose } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListHeader, RankedListHint, ZoomGroup } from './conceptShared';
import { type LayoutProps, type LandingView } from '@/lib/landing/landingCore';
import { matchesMunicipalityName } from '@/lib/landing/landingData';
import { CategoryFilterBar, DateRangePill, FewResultsHint, MapStyleToggle, MunicipalityBar } from './controls';
import { landingSearchHref, SearchChip, SearchErrorPill, SearchResultsFooter } from './searchSummary';
import { DesktopSearch } from './SearchPanel';
import { CoLocatedBox, GeneralSubjectsBox } from './mapMarkers';
import { MunicipalitiesList, MunicipalitySearch } from './MunicipalitiesList';
import { LandingAside } from './LandingAside';
import { SubjectList } from './SubjectList';
import { InfoPanel } from './InfoPanel';

/* ============================ DESKTOP LAYOUT ============================ */
export function DesktopLayout({
    view,
    setView,
    cats,
    onToggleCat,
    onClearCats,
    range,
    setRange,
    filters,
    setFilters,
    query,
    setQuery,
    topics,
    cities,
    subjectCountByCity,
    petitionedCities,
    petitionedBelowThreshold,
    onOpenPetitioned,
    upcoming,
    loading,
    selectedId,
    selectSubject,
    clearSelection,
    ordered,
    count,
    coLocated,
    onCoLocatedSelect,
    onCoLocatedClose,
    generalBox,
    onGeneralSelect,
    onGeneralBoxClose,
    satellite,
    toggleMapStyle,
    locate,
    onLocateAddress,
    onCommitSearch,
    committedSearch,
    onClearSearch,
    searchFailed,
    onRetrySearch,
    outsideViewCount,
    onFitSearchResults,
    zoomIn,
    zoomOut,
    displayedMunicipality,
    mapNode,
    infoOpen,
    onToggleInfo,
    infoHint,
    explainAvailable,
    realm,
}: LayoutProps) {
    const t = useTranslations('landingV2');
    // The list panel beside the rail — collapsible (X), default open.
    const [panelOpen, setPanelOpen] = useState(true);
    // The Δήμοι tab's name search. Narrows the cards and the petition leaderboard alike; the
    // below-threshold tail says nothing about a name, so it goes while a search is on.
    const [municipalityQuery, setMunicipalityQuery] = useState('');
    const municipalityFilter = municipalityQuery.trim();
    const shownCities = municipalityFilter
        ? cities.filter((c) => matchesMunicipalityName(municipalityFilter, c.name, c.name_municipality, c.name_en))
        : cities;
    const shownPetitioned = municipalityFilter
        ? petitionedCities.filter((c) => matchesMunicipalityName(municipalityFilter, c.name, c.nameMunicipality))
        : petitionedCities;

    // A rail nav click selects the view and (re)opens the panel; re-clicking the active tab
    // collapses it (but not when coming from the info drawer — then it just opens the tab).
    const selectView = (v: LandingView) => {
        if (!infoOpen && v === view && panelOpen) {
            setPanelOpen(false);
            return;
        }
        if (v === 'municipalities') clearSelection();
        setView(v); // also closes the info drawer (see trackedSetView)
        setPanelOpen(true);
    };

    useEffect(() => {
        if (!selectedId) return;
        setPanelOpen(true);
        if (view !== 'subjects') setView('subjects');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    // Floating search/controls clear the rail (panel closed) or the rail + panel (open — the info
    // drawer occupies the same column, so it counts as open too).
    const floatLeft = panelOpen || infoOpen ? 'left-[516px]' : 'left-[112px]';

    return (
        // Full-viewport split: map fills the screen; rail + panel float on the left.
        <div className="relative isolate h-[100dvh] w-full overflow-hidden bg-muted">
            {mapNode}

            {/* subjects loading (initial / after a filter change) — a small pill centered over the
                map area (~2/3 of the width, clear of the left panel), like the δήμος page button */}
            {loading && (
                <div className="pointer-events-none absolute left-2/3 top-[116px] z-[6] -translate-x-1/2">
                    <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md backdrop-blur">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('list.loading')}
                    </div>
                </div>
            )}

            {/* unified aside card: nav rail | vertical divider | collapsible list */}
            <aside
                className="absolute bottom-4 left-4 top-4 z-[7] flex overflow-hidden rounded-2xl border border-black/40 bg-muted shadow-2xl ring-1 ring-black/5"
            >
                <LandingAside view={view} onSelect={selectView} infoOpen={infoOpen} onToggleInfo={onToggleInfo} infoHint={infoHint} cities={cities} realm={realm} />

                {/* collapsible list column — the info drawer reuses it (over the current map) */}
                {(panelOpen || infoOpen) && (
                    <div className="flex w-[400px] flex-col">
                        <ListHeader
                            title={infoOpen ? t('info.title') : view === 'home' ? 'OpenCouncil' : view === 'subjects' ? t('nav.subjects') : t('nav.municipalities')}
                            count={infoOpen ? undefined : view === 'subjects' ? count : view === 'municipalities' ? shownCities.length : undefined}
                            className="bg-card"
                            trailing={
                                <button
                                    type="button"
                                    aria-label={t('nav.collapse')}
                                    onClick={() => (infoOpen ? onToggleInfo() : setPanelOpen(false))}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    <PanelLeftClose className="h-4 w-4" />
                                </button>
                            }
                        />

                    {/* what the list actually is — "Πρόσφατα πολυσυζητημένα" + on-demand explainer.
                        Part of the white header block; hidden while a text search re-purposes the
                        list into plain matches, and while there is no ranked list to describe —
                        an empty or still-loading list must not be captioned "most-discussed". */}
                    {/* Keyed on the committed search rather than on the box having text:
                        the text now stays after committing, and that is exactly when the
                        caption has to name the query the list is ordered against. */}
                    {!infoOpen && view === 'subjects' && !loading && count > 0 && (
                        <div className="-mt-2 bg-card px-4 pb-2.5">
                            <RankedListHint
                                searchQuery={committedSearch?.query}
                                searchHref={committedSearch ? landingSearchHref(committedSearch.query, cats, filters) : undefined}
                            />
                        </div>
                    )}

                    {/* the Δήμοι tab's search box — in the white header block, so it stays put while
                        the cards scroll */}
                    {!infoOpen && view === 'municipalities' && (
                        <div className="-mt-1 bg-card px-4 pb-3">
                            <MunicipalitySearch value={municipalityQuery} onChange={setMunicipalityQuery} />
                        </div>
                    )}

                    {infoOpen ? (
                        <InfoPanel explainAvailable={explainAvailable} />
                    ) : view === 'municipalities' ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/50 mb-3 px-4 py-4">
                            <MunicipalitiesList
                                cities={shownCities}
                                subjectCountByCity={subjectCountByCity}
                                upcoming={upcoming}
                                selectedCityId={filters.cityIds[0] ?? null}
                                // like picking the δήμος in the filters — filter to it, stay on Δήμοι
                                onShowOnMap={(id) =>
                                    setFilters({ ...filters, cityIds: filters.cityIds[0] === id ? [] : [id] })
                                }
                                petitionedCities={shownPetitioned}
                                petitionedBelowThreshold={municipalityFilter ? 0 : petitionedBelowThreshold}
                                onOpenPetitioned={onOpenPetitioned}
                                noMatch={!!municipalityFilter && shownCities.length === 0 && shownPetitioned.length === 0}
                            />
                        </div>
                    ) : (
                        <SubjectList
                            subjects={ordered}
                            selectedId={selectedId}
                            onSelect={selectSubject}
                            loading={loading}
                            variant="desktop"
                            footer={
                                committedSearch ? (
                                    <SearchResultsFooter
                                        search={committedSearch}
                                        outsideViewCount={outsideViewCount}
                                        cats={cats}
                                        filters={filters}
                                        onFitResults={onFitSearchResults}
                                    />
                                ) : (
                                <FewResultsHint
                                    loading={loading}
                                    count={count}
                                    cats={cats}
                                    onClearCats={onClearCats}
                                    query={query}
                                    setQuery={setQuery}
                                    filters={filters}
                                    setFilters={setFilters}
                                    range={range}
                                    setRange={setRange}
                                    onZoomOut={zoomOut}
                                />
                                )
                            }
                        />
                    )}
                    </div>
                )}
            </aside>

            {/* floating search + date range + topic filters (subjects view only) */}
            {view === 'subjects' && (
                <div className={`pointer-events-none absolute right-4 top-4 z-[6] flex flex-col gap-3 ${floatLeft}`}>
                    {/* z-20 keeps the search dropdown above the category row below it */}
                    <div className="pointer-events-auto relative z-20 flex items-center gap-2.5">
                        <div className="min-w-0 flex-1">
                            <DesktopSearch
                                topics={topics}
                                cities={cities}
                                cats={cats}
                                onToggleCat={onToggleCat}
                                onClearCats={onClearCats}
                                filters={filters}
                                onFiltersChange={setFilters}
                                query={query}
                                onQueryChange={setQuery}
                                onLocateAddress={onLocateAddress}
                                onCommitSearch={onCommitSearch}
                            />
                        </div>
                        <DateRangePill value={range} onChange={setRange} />
                    </div>
                    <div className="pointer-events-auto relative z-10">
                        <CategoryFilterBar
                            topics={topics}
                            selected={cats}
                            onToggle={onToggleCat}
                            onClear={onClearCats}
                            leading={
                                committedSearch || searchFailed ? (
                                    <>
                                        {committedSearch && (
                                            <SearchChip search={committedSearch} onClear={onClearSearch} />
                                        )}
                                        {searchFailed && <SearchErrorPill onRetry={onRetrySearch} />}
                                    </>
                                ) : undefined
                            }
                        />
                    </div>
                </div>
            )}

            {/* locate + zoom controls (bottom-right) */}
            <div className="absolute bottom-4 right-4 z-[6] flex flex-col items-end gap-2">
                <button
                    type="button"
                    onClick={locate}
                    aria-label={t('map.locate')}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-accent text-accent-foreground shadow-md transition hover:brightness-95"
                >
                    <LocateFixed className="h-4 w-4" />
                </button>
                <ZoomGroup onZoomIn={zoomIn} onZoomOut={zoomOut} />
            </div>

            {/* bottom of the map: the basemap toggle and the bar into the δήμος the map is about —
                on every view, in the room left up to the zoom controls. One row from xl up; below
                that the row is too short for both, so the bar takes a row of its own above the
                toggle. The block itself lets pointer events through, so the map stays draggable
                around the two. */}
            <div
                className={`pointer-events-none absolute bottom-4 right-[72px] z-[6] flex flex-col-reverse items-start gap-3 xl:flex-row xl:items-end xl:gap-4 ${floatLeft}`}
            >
                <div className="pointer-events-auto shrink-0">
                    <MapStyleToggle satellite={satellite} onToggle={toggleMapStyle} />
                </div>
                {displayedMunicipality && (
                    <div className="pointer-events-auto flex w-full min-w-0 justify-center xl:flex-1">
                        <MunicipalityBar
                            municipality={displayedMunicipality}
                            cities={cities}
                            subjectCountByCity={subjectCountByCity}
                            className="max-w-[720px]"
                        />
                    </div>
                )}
            </div>

            {coLocated && <CoLocatedBox data={coLocated} onSelect={onCoLocatedSelect} onClose={onCoLocatedClose} />}

            {generalBox && <GeneralSubjectsBox data={generalBox} onSelect={onGeneralSelect} onClose={onGeneralBoxClose} />}
        </div>
    );
}
