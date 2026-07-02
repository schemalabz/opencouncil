'use client';

import { useState, type ReactNode } from 'react';
import { Landmark, ArrowRight, LocateFixed, X, Home, Map as MapIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { ListHeader } from './conceptShared';
import { SubjectCard } from './SubjectCard';
import type { LandingSubject } from './landingData';
import { hasActiveFilters, type LandingView, type LayoutProps } from './landingCore';
import { DateRangePill, FewResultsHint, FilterIconButton, MapStyleToggle } from './controls';
import { MobileSearchOverlay } from './SearchPanel';
import { CoLocatedBox, GeneralSubjectsBox } from './mapMarkers';
import { MunicipalitiesList } from './MunicipalitiesList';
import { SubjectList } from './SubjectList';
import { MobileHeader } from './MobileHeader';

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
    zoomOut,
    onLocateAddress,
    explainOpen,
    onCloseExplain,
    mapNode,
}: LayoutProps) {
    const t = useTranslations('landingV2');
    // null = closed; 'search' = opened via the search icon; 'filters' = opened via the filters icon.
    const [searchMode, setSearchMode] = useState<'search' | 'filters' | null>(null);

    // Switch the bottom-nav view; the municipalities map drops any selected subject.
    const changeView = (v: LandingView) => {
        if (v === 'municipalities') clearSelection();
        setView(v);
    };
    // Selecting a subject (list tap / search) brings the user to the Home map to see it.
    const selectOnMap = (id: string) => {
        selectSubject(id);
        setView('home');
    };

    const onMap = view === 'home';

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
            {mapNode}

            {/* full-screen list views over the map */}
            {view === 'subjects' && (
                <section
                    style={{
                        backgroundImage:
                            'linear-gradient(to bottom, color-mix(in srgb, hsl(var(--orange)) 10%, hsl(var(--muted))), hsl(var(--muted)) 55%)',
                    }}
                    className="absolute inset-x-3 bottom-[64px] top-[76px] z-[8] flex flex-col overflow-hidden rounded-2xl border border-border bg-muted shadow-xl"
                >
                    <ListHeader
                        title={t('nav.subjects')}
                        count={trending.length}
                        onBack={() => changeView('home')}
                        backLabel={t('nav.backToMap')}
                        className="bg-card"
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

            {view === 'municipalities' && (
                <section
                    style={{
                        backgroundImage:
                            'linear-gradient(to bottom, color-mix(in srgb, hsl(var(--orange)) 10%, hsl(var(--muted))), hsl(var(--muted)) 55%)',
                    }}
                    className="absolute inset-x-3 bottom-[64px] top-[76px] z-[8] flex flex-col overflow-hidden rounded-2xl border border-border bg-muted shadow-xl"
                >
                    <ListHeader
                        title={t('nav.municipalities')}
                        count={cities.length}
                        onBack={() => changeView('home')}
                        backLabel={t('nav.backToMap')}
                        className="bg-card"
                    />
                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-4">
                        <MunicipalitiesList cities={cities} subjectCountByCity={subjectCountByCity} upcoming={upcoming} />
                    </div>
                </section>
            )}

            <MobileHeader onOpenSearch={() => setSearchMode('search')} />

            {/* HOME map extras — only when the map is the active screen */}
            {onMap && (
                <>
                    {/* floating date range + filter icon, below the header */}
                    <div className="absolute inset-x-3 top-[78px] z-[7] flex items-center justify-end gap-2">
                        {(hasActiveFilters(filters) || cats.length > 0 || query.trim().length > 0) && (
                            <FilterIconButton compact active onClick={() => setSearchMode('filters')} />
                        )}
                        <DateRangePill value={range} onChange={setRange} />
                    </div>

                    {/* bottom-right map controls — locate, with the basemap toggle below it */}
                    {!selectedSubject && (
                        <div className="absolute bottom-[88px] right-3 z-[7] flex flex-col items-end gap-2">
                            <button
                                type="button"
                                onClick={locate}
                                aria-label={t('map.locate')}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-accent text-accent-foreground shadow-md transition hover:brightness-95"
                            >
                                <LocateFixed className="h-4 w-4" />
                            </button>
                            <MapStyleToggle satellite={satellite} onToggle={toggleMapStyle} iconOnly />
                        </div>
                    )}

                    {coLocated && <CoLocatedBox data={coLocated} onSelect={onCoLocatedSelect} onClose={onCoLocatedClose} />}
                    {generalBox && <GeneralSubjectsBox data={generalBox} onSelect={onGeneralSelect} onClose={onGeneralBoxClose} />}

                    {selectedSubject && <MobileSubjectPreview subject={selectedSubject} onClose={clearSelection} />}
                    {explainOpen && <MobileExplainPreview onClose={onCloseExplain} />}
                </>
            )}

            {/* bottom view switcher */}
            <MobileViewSwitch view={view} onChange={changeView} />

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

/* bottom-center floating switcher — Αρχική (map) / Θέματα (list) / Δήμοι (list) */
function MobileViewSwitch({ view, onChange }: { view: LandingView; onChange: (v: LandingView) => void }) {
    const t = useTranslations('landingV2');
    const items: { v: LandingView; icon: typeof Home }[] = [
        { v: 'home', icon: Home },
        { v: 'subjects', icon: MapIcon },
        { v: 'municipalities', icon: Landmark },
    ];
    return (
        <div className="absolute bottom-[9px] left-1/2 z-[10] -translate-x-1/2">
            <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-lg">
                {items.map(({ v, icon: Icon }) => {
                    const active = view === v;
                    return (
                        <button
                            key={v}
                            type="button"
                            onClick={() => onChange(v)}
                            aria-pressed={active}
                            className={cn(
                                'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors',
                                active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {t(`nav.${v}`)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* drawer row — an internal link (icon + label) that closes the menu on tap */
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
