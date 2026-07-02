'use client';

import { useEffect, useState } from 'react';
import { LocateFixed, PanelLeftClose } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListHeader, ZoomGroup } from './conceptShared';
import { type LayoutProps, type LandingView } from './landingCore';
import { CategoryFilterBar, DateRangePill, FewResultsHint, MapStyleToggle, MunicipalityPageButton } from './controls';
import { DesktopSearch } from './SearchPanel';
import { CoLocatedBox, GeneralSubjectsBox } from './mapMarkers';
import { MunicipalitiesList } from './MunicipalitiesList';
import { LandingAside } from './LandingAside';
import { SubjectList } from './SubjectList';

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
    queryKind,
    topics,
    cities,
    subjectCountByCity,
    upcoming,
    loading,
    selectedId,
    selectSubject,
    clearSelection,
    ordered,
    count,
    searchResults,
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
    zoomIn,
    zoomOut,
    displayedMunicipality,
    mapNode,
}: LayoutProps) {
    const t = useTranslations('landingV2');
    // The list panel beside the rail — collapsible (X), default open.
    const [panelOpen, setPanelOpen] = useState(true);

    // A rail nav click selects the view and (re)opens the panel; clicking the already-active
    // tab while the panel is open collapses it (toggle). The municipalities map drops any
    // selected subject (its pin/preview is gone in that mode).
    const selectView = (v: LandingView) => {
        if (v === view && panelOpen) {
            setPanelOpen(false);
            return;
        }
        if (v === 'municipalities') clearSelection();
        setView(v);
        setPanelOpen(true);
    };

    // Selecting a subject (map pin, search, deep link) opens the panel to reveal it.
    useEffect(() => {
        if (selectedId) setPanelOpen(true);
    }, [selectedId]);

    // Floating search/controls clear the rail (panel closed) or the rail + panel (open).
    const floatLeft = panelOpen ? 'left-[516px]' : 'left-[112px]';

    return (
        // Fixed full-viewport split: the map fills the screen; the rail + panel float on the left.
        <div className="relative isolate h-[100dvh] w-full overflow-hidden bg-muted">
            {mapNode}

            {/* unified aside card: nav rail | vertical divider | collapsible list */}
            <aside
                style={{
                    backgroundImage:
                        'linear-gradient(to bottom, color-mix(in srgb, hsl(var(--orange)) 10%, hsl(var(--muted))), hsl(var(--muted)) 55%)',
                }}
                className="absolute bottom-4 left-4 top-4 z-[7] flex overflow-hidden rounded-2xl border-2 border-border bg-muted shadow-2xl ring-1 ring-black/5"
            >
                <LandingAside view={view} onSelect={selectView} />

                {/* collapsible list column */}
                {panelOpen && (
                    <div className="flex w-[400px] flex-col">
                        <ListHeader
                            title={view === 'home' ? 'OpenCouncil' : view === 'subjects' ? t('nav.subjectsNearYou') : t('nav.municipalities')}
                            count={view === 'subjects' ? count : view === 'municipalities' ? cities.length : undefined}
                            className="bg-card"
                            trailing={
                                <button
                                    type="button"
                                    aria-label={t('nav.collapse')}
                                    onClick={() => setPanelOpen(false)}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    <PanelLeftClose className="h-4 w-4" />
                                </button>
                            }
                        />

                    {view === 'municipalities' ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/50 mb-3 px-4 py-4">
                            <MunicipalitiesList cities={cities} subjectCountByCity={subjectCountByCity} upcoming={upcoming} />
                        </div>
                    ) : (
                        <SubjectList
                            subjects={ordered}
                            selectedId={selectedId}
                            onSelect={selectSubject}
                            loading={loading}
                            variant="desktop"
                            footer={
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
                        <div className="w-full max-w-[720px]">
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
                                queryKind={queryKind}
                                results={searchResults}
                                onPickResult={selectSubject}
                                onLocateAddress={onLocateAddress}
                            />
                        </div>
                        <DateRangePill value={range} onChange={setRange} />
                    </div>
                    <div className="pointer-events-auto relative z-10">
                        <CategoryFilterBar topics={topics} selected={cats} onToggle={onToggleCat} onClear={onClearCats} />
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

            {/* basemap toggle (bottom, clear of the rail/panel) */}
            <div className={`absolute bottom-4 z-[6] flex items-center gap-2 ${floatLeft}`}>
                <MapStyleToggle satellite={satellite} onToggle={toggleMapStyle} />
            </div>

            {/* displayed δήμος's page link — centered over the map area, subjects view only */}
            {view === 'subjects' && displayedMunicipality && (
                <div className="absolute bottom-4 left-2/3 z-[6] -translate-x-1/2">
                    <MunicipalityPageButton
                        cityId={displayedMunicipality.id}
                        nameMunicipality={displayedMunicipality.nameMunicipality}
                        logoImage={cities.find((c) => c.id === displayedMunicipality.id)?.logoImage}
                        large
                    />
                </div>
            )}

            {coLocated && <CoLocatedBox data={coLocated} onSelect={onCoLocatedSelect} onClose={onCoLocatedClose} />}

            {generalBox && <GeneralSubjectsBox data={generalBox} onSelect={onGeneralSelect} onClose={onGeneralBoxClose} />}
        </div>
    );
}
