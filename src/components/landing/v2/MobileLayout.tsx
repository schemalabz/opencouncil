'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Landmark, ArrowRight, LocateFixed, X, Map as MapIcon, ChevronDown, HelpCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { ListHeader } from './conceptShared';
import { SubjectCard } from './SubjectCard';
import type { LandingSubject } from '@/lib/landing/landingData';
import { hasActiveFilters, type LandingView, type LayoutProps } from '@/lib/landing/landingCore';
import { DateRangePill, FewResultsHint, FilterIconButton, MapStyleToggle } from './controls';
import { MobileSearchOverlay } from './SearchPanel';
import { CoLocatedBox, GeneralSubjectsBox } from './mapMarkers';
import { MunicipalitiesList } from './MunicipalitiesList';
import { SubjectList } from './SubjectList';
import { MobileHeader } from './MobileHeader';
import { InfoPanel } from './InfoPanel';

/* ============================ MOBILE LAYOUT ============================ */
export function MobileLayout({
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
    selectedId,
    selectSubject,
    clearSelection,
    selectedSubject,
    trending,
    loading,
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
    geoError,
    onDismissGeoError,
    zoomOut,
    onLocateAddress,
    explainOpen,
    onCloseExplain,
    infoOpen,
    onToggleInfo,
    mapNode,
}: LayoutProps) {
    const t = useTranslations('landingV2');
    // null = closed; 'search'/'filters' = which icon opened the overlay.
    const [searchMode, setSearchMode] = useState<'search' | 'filters' | null>(null);
    // Auto-dismiss the geolocation error tooltip a few seconds after it appears.
    useEffect(() => {
        if (!geoError) return;
        const id = setTimeout(onDismissGeoError, 6000);
        return () => clearTimeout(id);
    }, [geoError, onDismissGeoError]);
    // Whether the active tab's list is collapsed. Collapsing keeps the tab's view and map layer,
    // just hiding the list so the map shows underneath. Starts collapsed: the landing opens on
    // the subjects map with the Θέματα tab active but its list closed.
    const [listCollapsed, setListCollapsed] = useState(true);

    // Switch the bottom-nav view; the municipalities map drops any selected subject.
    const changeView = (v: LandingView) => {
        if (v === 'municipalities') clearSelection();
        setView(v);
    };
    // Re-tapping the open tab collapses/expands its list; a different tab switches map and opens
    // its list.
    const selectTab = (v: LandingView) => {
        if (!infoOpen && view === v) {
            setListCollapsed((c) => !c);
            return;
        }
        changeView(v); // also closes the info drawer (see trackedSetView)
        setListCollapsed(false);
    };
    // Selecting a subject (list tap / search) brings the user to the Home map to see it.
    const selectOnMap = (id: string) => {
        selectSubject(id);
        setView('home');
    };

    // A list view is active but not collapsed → the list panel covers the map. The info drawer
    // (independent overlay) takes precedence over both the list and the map extras.
    const showList = (view === 'subjects' || view === 'municipalities') && !listCollapsed && !infoOpen;
    const mapVisible = !showList && !infoOpen;

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
            {mapNode}

            {/* full-screen list views over the map */}
            {showList && view === 'subjects' && (
                <section
                    className="absolute inset-x-3 bottom-[64px] top-[76px] z-[8] flex flex-col overflow-hidden rounded-2xl border border-black/40 bg-muted shadow-xl"
                >
                    <ListHeader
                        title={t('nav.subjects')}
                        count={trending.length}
                        className="bg-card"
                        onToggle={() => setListCollapsed(true)}
                    />
                    <SubjectList
                        subjects={trending}
                        selectedId={selectedId}
                        onSelect={selectOnMap}
                        loading={loading}
                        variant="mobile"
                        footer={
                            <FewResultsHint
                                loading={loading}
                                count={trending.length}
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
                </section>
            )}

            {showList && view === 'municipalities' && (
                <section
                    className="absolute inset-x-3 bottom-[64px] top-[76px] z-[8] flex flex-col overflow-hidden rounded-2xl border border-black/40 bg-muted shadow-xl"
                >
                    <ListHeader
                        title={t('nav.municipalities')}
                        count={cities.length}
                        className="bg-card"
                        onToggle={() => setListCollapsed(true)}
                    />
                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-4">
                        <MunicipalitiesList cities={cities} subjectCountByCity={subjectCountByCity} upcoming={upcoming} />
                    </div>
                </section>
            )}

            {/* "?" info drawer — explains the map (same sheet shell as the lists) */}
            {infoOpen && (
                <section className="absolute inset-x-3 bottom-[64px] top-[76px] z-[8] flex flex-col overflow-hidden rounded-2xl border border-black/40 bg-muted shadow-xl">
                    <ListHeader title={t('info.title')} className="bg-card" onToggle={onToggleInfo} />
                    <InfoPanel />
                </section>
            )}

            <MobileHeader onOpenSearch={() => setSearchMode('search')} searchActive={query.trim().length > 0} />

            {/* map extras — only when the map is the visible/interactive surface */}
            {mapVisible && (
                <>
                    {/* subjects loading (initial / after a filter change) — a small pill over the map */}
                    {loading && (
                        <div className="pointer-events-none absolute inset-0 z-[7] flex items-start justify-center pt-[120px]">
                            <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md backdrop-blur">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('list.loading')}
                            </div>
                        </div>
                    )}
                    {/* floating date range + filter icon, below the header */}
                    <div className="absolute inset-x-3 top-[68px] z-[7] flex items-center justify-end gap-2">
                        {(hasActiveFilters(filters) || cats.length > 0) && (
                            <FilterIconButton compact active onClick={() => setSearchMode('filters')} />
                        )}
                        <DateRangePill value={range} onChange={setRange} />
                    </div>

                    {/* bottom-right map controls — locate (with an error tooltip on its left), then
                        the basemap toggle below it */}
                    {!selectedSubject && (
                        <div className="absolute bottom-[88px] right-3 z-[7] flex flex-col items-end gap-2">
                            <div className="relative">
                                {geoError && (
                                    <div className="absolute right-[calc(100%+10px)] top-1/2 w-56 max-w-[70vw] -translate-y-1/2 rounded-xl border border-red-500/40 bg-card py-2 pl-3 pr-7 text-xs font-medium text-red-500 shadow-lg">
                                        {t('search.locationError')}
                                        {/* close */}
                                        <button
                                            type="button"
                                            onClick={onDismissGeoError}
                                            aria-label={t('common.close')}
                                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-red-500/70 transition-colors hover:bg-red-500/10 hover:text-red-500"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                        {/* pointer toward the locate icon */}
                                        <span
                                            aria-hidden
                                            className="absolute right-[-5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-r border-t border-red-500/40 bg-card"
                                        />
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={locate}
                                    aria-label={t('map.locate')}
                                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-accent text-accent-foreground shadow-md transition hover:brightness-95"
                                >
                                    <LocateFixed className="h-4 w-4" />
                                </button>
                            </div>
                            <MapStyleToggle satellite={satellite} onToggle={toggleMapStyle} iconOnly />
                        </div>
                    )}

                    {coLocated && <CoLocatedBox data={coLocated} onSelect={onCoLocatedSelect} onClose={onCoLocatedClose} />}
                    {generalBox && <GeneralSubjectsBox data={generalBox} onSelect={onGeneralSelect} onClose={onGeneralBoxClose} />}

                    {selectedSubject && <MobileSubjectPreview subject={selectedSubject} onClose={clearSelection} />}
                    {explainOpen && <MobileExplainPreview onClose={onCloseExplain} />}
                </>
            )}

            {/* standalone "?" guide — far bottom-left, separate from the centered tab pill */}
            <button
                type="button"
                onClick={onToggleInfo}
                aria-pressed={infoOpen}
                aria-label={t('nav.info')}
                className={cn(
                    'absolute bottom-[13px] left-3 z-[10] flex h-9 w-9 items-center justify-center rounded-full border border-black/40 shadow-lg transition-colors',
                    // no hover: variant — touch devices keep :hover stuck after a tap, which would
                    // leave the darker hover colour showing after you close the drawer.
                    infoOpen ? 'bg-foreground text-background' : 'bg-card text-muted-foreground/50',
                )}
            >
                <HelpCircle className="h-5 w-5" />
            </button>

            {/* bottom view switcher */}
            <MobileViewSwitch view={view} collapsed={listCollapsed} onSelect={selectTab} infoOpen={infoOpen} />

            {searchMode && (
                <MobileSearchOverlay
                    topics={topics}
                    cities={cities}
                    cats={cats}
                    filters={filters}
                    onFiltersChange={setFilters}
                    query={query}
                    onQueryChange={setQuery}
                    queryKind={queryKind}
                    results={searchResults}
                    loading={loading}
                    autoFocusInput={searchMode === 'search'}
                    scrollToActiveFilter={searchMode === 'filters'}
                    onPickResult={(id) => {
                        selectOnMap(id);
                        setSearchMode(null);
                    }}
                    onClose={() => setSearchMode(null)}
                    onToggleCat={onToggleCat}
                    onClearCats={onClearCats}
                    onLocateAddress={(q) => {
                        onLocateAddress(q);
                        setSearchMode(null);
                    }}
                />
            )}
        </div>
    );
}

/* bottom-center switcher — "?" guide · Θέματα · Δήμοι; re-tapping the active tab collapses its list. */
function MobileViewSwitch({
    view,
    collapsed,
    onSelect,
    infoOpen,
}: {
    view: LandingView;
    /** the active tab's list is collapsed → show a ▼ on it (tap to expand the list back up) */
    collapsed: boolean;
    onSelect: (v: LandingView) => void;
    /** info drawer open → de-highlight the tabs (the standalone "?" button owns the active state) */
    infoOpen: boolean;
}) {
    const t = useTranslations('landingV2');
    const items: { v: LandingView; icon: typeof MapIcon }[] = [
        { v: 'subjects', icon: MapIcon },
        { v: 'municipalities', icon: Landmark },
    ];
    return (
        <div className="absolute bottom-[9px] left-1/2 z-[10] -translate-x-1/2">
            <div className="flex items-center gap-1 rounded-full border border-black/40 bg-card p-1 shadow-lg">
                {items.map(({ v, icon: Icon }) => {
                    const active = !infoOpen && view === v;
                    return (
                        <button
                            key={v}
                            type="button"
                            onClick={() => onSelect(v)}
                            aria-pressed={active}
                            className={cn(
                                'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors',
                                active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {t(`nav.${v}`)}
                            {active && collapsed && <ChevronDown className="h-4 w-4 opacity-80" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* subject preview (mobile) — the compact SubjectCard, anchored above the bottom switcher */
function MobileSubjectPreview({ subject, onClose }: { subject: LandingSubject; onClose: () => void }) {
    return (
        <div className="absolute inset-x-3 bottom-[62px] z-[9]">
            <SubjectCard subject={subject} variant="preview" onClose={onClose} />
        </div>
    );
}

/* OpenCouncil preview (mobile) — same card treatment, anchored above the switcher */
function MobileExplainPreview({ onClose }: { onClose: () => void }) {
    const t = useTranslations('landingV2');
    return (
        <div className="absolute inset-x-3 bottom-[62px] z-[9]">
            <div className="relative rounded-2xl border border-[hsl(var(--orange))]/40 bg-card/95 shadow-xl backdrop-blur">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close')}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                    <X className="h-4 w-4" />
                </button>
                <Link href="/explain" className="flex flex-col gap-1.5 p-3 pr-9 no-underline hover:no-underline">
                    <span className="text-[15px] font-bold leading-snug text-foreground">{t('explain.title')}</span>
                    <span className="text-xs text-muted-foreground">
                        {t('explain.body')}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[hsl(var(--orange))]">
                        {t('common.learnMore')} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                </Link>
            </div>
        </div>
    );
}
