'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, X, HelpCircle, Loader2, LocateFixed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { ListHeader, RankedListHint } from './conceptShared';
import { landingSearchHref, SearchErrorPill, SearchResultsCard } from './searchSummary';
import { type LandingListCity, type LandingPetitionedCity, type UpcomingMeeting } from '@/lib/landing/landingData';
import { PETITION_DISPLAY_THRESHOLD } from '@/lib/landing/petitions';
import { hasActiveFilters, type LayoutProps } from '@/lib/landing/landingCore';
import { DateRangePill, FilterIconButton, MapStyleToggle, MunicipalityBar } from './controls';
import { MobileSearchOverlay } from './SearchPanel';
import { CoLocatedBox, GeneralSubjectsBox } from './mapMarkers';
import { MobileHeader } from './MobileHeader';
import { InfoPanel } from './InfoPanel';
import { MunicipalityCard, PetitionCta, PetitionedRow } from './MunicipalitiesList';
import { SubjectStrip } from '@/components/map/subjects/SubjectStrip';
import { SubjectExpandedCard } from '@/components/map/subjects/SubjectExpandedCard';

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
    topics,
    cities,
    subjectCountByCity,
    upcoming,
    selectSubject,
    clearSelection,
    selectedSubject,
    trending,
    previewId,
    previewSubject,
    loading,
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
    onLocateAddress,
    onCommitSearch,
    committedSearch,
    searchFailed,
    onRetrySearch,
    outsideViewCount,
    onFitSearchResults,
    overviewActive,
    explainOpen,
    explainAvailable,
    realm,
    onCloseExplain,
    infoOpen,
    onToggleInfo,
    infoHint,
    petitionedCities,
    petitionedBelowThreshold,
    onOpenPetitioned,
    displayedMunicipality,
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
    // The bottom tab tracks the shared `view` (so it's reflected in the ?view= URL param); on mobile
    // it only swaps the list, never the map. 'home' collapses to the Θέματα tab.
    const tab: 'subjects' | 'municipalities' = view === 'municipalities' ? 'municipalities' : 'subjects';
    // The list above the tabs can be collapsed to reveal the map; re-tapping the active tab toggles it.
    // Starts collapsed in the zoomed-out overview (Greece / cluster view), where there's no δήμος to
    // list subjects for.
    const [listCollapsed, setListCollapsed] = useState(overviewActive);
    // Follow the overview state on each crossing: collapse when zooming out to the country/cluster
    // view, open when drilling into a δήμος. Only on the transition, so a manual re-tap within either
    // band isn't overridden.
    const prevOverviewRef = useRef(overviewActive);
    useEffect(() => {
        if (overviewActive !== prevOverviewRef.current) {
            prevOverviewRef.current = overviewActive;
            setListCollapsed(overviewActive);
        }
    }, [overviewActive]);
    // Re-tap the active tab → collapse/expand its list; a different tab switches and expands.
    const selectTab = (v: 'subjects' | 'municipalities') => {
        if (tab === v) {
            setListCollapsed((c) => !c);
        } else {
            setView(v);
            setListCollapsed(false);
        }
    };
    // A NEW preview snaps to the Θέματα list (expanded) so it's visible. Keyed on previewId only —
    // depending on `tab` would re-fire and fight a manual switch to the Δήμοι tab (flicker).
    useEffect(() => {
        if (!previewId) return;
        if (tab !== 'subjects') setView('subjects');
        setListCollapsed(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewId]);

    // The map is the surface unless the "?" info drawer is open.
    const mapVisible = !infoOpen;
    // The bar into the δήμος the map is about sits between the list and the tabs — a fixed spot
    // whatever the list does — and everything above the tabs moves up by its height while it shows.
    // Hidden with the rest of the bottom band while a subject or the OpenCouncil card covers it.
    const barVisible = !!displayedMunicipality && !selectedSubject && !explainOpen;

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
            {mapNode}

            {/* "?" info drawer — explains the map */}
            {infoOpen && (
                <section className="absolute inset-x-3 bottom-[10px] top-[76px] z-[8] flex flex-col overflow-hidden rounded-2xl border border-black/40 bg-muted shadow-xl">
                    <ListHeader title={t('info.title')} className="bg-card" onToggle={() => onToggleInfo()} />
                    <InfoPanel explainAvailable={explainAvailable} />
                </section>
            )}

            <MobileHeader
                        onOpenSearch={() => setSearchMode('search')}
                        onToggleInfo={onToggleInfo}
                        cities={cities}
                        searchActive={query.trim().length > 0}
                        query={query}
                        realm={realm}
                    />

            {/* map extras — only when the map is the visible/interactive surface */}
            {mapVisible && (
                <>
                    {/* subjects loading (initial / after a filter change) — a small pill over the map */}
                    {loading && (
                        <div className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center">
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

                    {/* map controls — "?" and the basemap toggle, inline with the bottom tabs, with
                        "my location" (and its error tooltip) stacked above the basemap toggle.
                        Hidden while a subject card or the OpenCouncil office card covers the bottom. */}
                    {!selectedSubject && !explainOpen && (
                        <>
                            {/* first-visit "Τι είναι αυτό;" hint — a bubble just above the "?".
                                Gated to the collapsed-list map state with no co-located/general box
                                and no δήμος bar open, so it can never cover another element;
                                pointer-events-none keeps the map behind it interactive. */}
                            {infoHint && listCollapsed && !coLocated && !generalBox && !barVisible && (
                                <div className="pointer-events-none absolute bottom-[58px] left-3 z-[10]">
                                    <div className="relative rounded-full bg-[hsl(var(--orange))] px-3 py-1.5 text-[13px] font-bold text-white shadow-lg">
                                        {t('info.title')}
                                        {/* pointer toward the "?" button below */}
                                        <span
                                            aria-hidden
                                            className="absolute -bottom-1 left-[19px] h-2.5 w-2.5 rotate-45 bg-[hsl(var(--orange))]"
                                        />
                                    </div>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => onToggleInfo('float')}
                                aria-pressed={infoOpen}
                                aria-label={t('nav.info')}
                                className={cn(
                                    'absolute bottom-[10px] left-5 z-[10] flex h-10 w-10 items-center justify-center rounded-full border shadow-md',
                                    infoHint
                                        ? 'border-[hsl(var(--orange))] bg-[hsl(var(--orange))] text-white'
                                        : 'border-[hsl(var(--orange))]/50 text-[hsl(var(--orange))]',
                                )}
                                // opaque wash rather than the `/10` tint used on the desktop rail: this
                                // one floats over the map, and a translucent fill would pick up the
                                // tiles underneath — muddy over satellite. (Solid orange while the
                                // first-visit hint is on.)
                                style={infoHint ? undefined : { backgroundColor: 'color-mix(in srgb, hsl(var(--orange)) 12%, white)' }}
                            >
                                <HelpCircle className="h-5 w-5" />
                            </button>
                            {/* locate + satellite — hidden while the list (subjects/δήμοι) is open,
                                so they don't crowd the strip. */}
                            {listCollapsed && (
                            <div
                                className={cn(
                                    'absolute right-3 z-[10] flex flex-col items-end gap-2',
                                    barVisible ? 'bottom-[124px]' : 'bottom-[88px]',
                                )}
                            >
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
                        </>
                    )}

                    {coLocated && <CoLocatedBox data={coLocated} onSelect={onCoLocatedSelect} onClose={onCoLocatedClose} />}
                    {generalBox && <GeneralSubjectsBox data={generalBox} onSelect={onGeneralSelect} onClose={onGeneralBoxClose} />}

                    {/* the way into the δήμος the map is about — just above the tabs, on both tabs */}
                    {barVisible && displayedMunicipality && (
                        <div className="absolute inset-x-3 bottom-[62px] z-[9]">
                            <MunicipalityBar
                                municipality={displayedMunicipality}
                                cities={cities}
                                subjectCountByCity={subjectCountByCity}
                                compact
                            />
                        </div>
                    )}

                    {/* bottom band: an expanded subject · the OpenCouncil card · else the list + tabs */}
                    {selectedSubject ? (
                        <SubjectExpandedCard
                            subject={selectedSubject}
                            // × → return to previewing this subject (re-centres the map, undoing the
                            // select up-scroll, and keeps it highlighted in the strip)
                            onClose={() => {
                                const id = selectedSubject.id;
                                clearSelection();
                                previewSubject(id);
                            }}
                        />
                    ) : explainOpen ? (
                        <MobileExplainPreview onClose={onCloseExplain} />
                    ) : (
                        <>
                            {/* the list (horizontal cards) sits above the tabs — or above the δήμος
                                bar — only while expanded */}
                            {!listCollapsed && (
                                <div className={cn('absolute inset-x-0 z-[9]', barVisible ? 'bottom-[122px]' : 'bottom-[62px]')}>
                                    {/* what the strip actually is — a small pill floating over the
                                        map (costs no layout space). It names the ordering, so a
                                        committed search changes what it says rather than hiding
                                        it, and the query is not repeated in a chip beside it. */}
                                    {tab === 'subjects' && (committedSearch || searchFailed || trending.length > 0) && (
                                        <div
                                            className="mb-2 flex items-center gap-2 overflow-x-auto px-3 [&::-webkit-scrollbar]:hidden"
                                            style={{ scrollbarWidth: 'none' }}
                                        >
                                            {searchFailed && <SearchErrorPill onRetry={onRetrySearch} floating />}
                                            <RankedListHint
                                                floating
                                                searchQuery={committedSearch?.query}
                                                searchHref={committedSearch ? landingSearchHref(committedSearch.query, cats, filters) : undefined}
                                            />
                                        </div>
                                    )}
                                    {tab === 'subjects' ? (
                                        <SubjectStrip
                                            subjects={trending}
                                            previewId={previewId}
                                            onPreview={previewSubject}
                                            onSelect={selectSubject}
                                            trailing={
                                                committedSearch ? (
                                                    <SearchResultsCard
                                                        search={committedSearch}
                                                        outsideViewCount={outsideViewCount}
                                                        cats={cats}
                                                        filters={filters}
                                                        onFitResults={onFitSearchResults}
                                                    />
                                                ) : null
                                            }
                                        />
                                    ) : (
                                        <MobileMunicipalityStrip
                                            cities={cities}
                                            subjectCountByCity={subjectCountByCity}
                                            upcoming={upcoming}
                                            selectedCityId={filters.cityIds[0] ?? null}
                                            onShowOnMap={(id) => {
                                                // like picking the δήμος in the filters — filter to it, stay on Δήμοι
                                                setFilters({ ...filters, cityIds: filters.cityIds[0] === id ? [] : [id] });
                                            }}
                                            petitionedCities={petitionedCities}
                                            petitionedBelowThreshold={petitionedBelowThreshold}
                                            onOpenPetitioned={(c) => {
                                                // collapse the strip so the map focus + preview are visible
                                                setListCollapsed(true);
                                                onOpenPetitioned(c);
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                            {/* Θέματα / Δήμοι tabs at the bottom — switch the list only, never the map */}
                            <MobileViewSwitch tab={tab} collapsed={listCollapsed} onSelect={selectTab} />
                        </>
                    )}
                </>
            )}

            {/* full-screen search / filters overlay (main's) */}
            {searchMode && (
                <MobileSearchOverlay
                    topics={topics}
                    cities={cities}
                    cats={cats}
                    filters={filters}
                    onFiltersChange={setFilters}
                    query={query}
                    onQueryChange={setQuery}
                    autoFocusInput={searchMode === 'search'}
                    scrollToActiveFilter={searchMode === 'filters'}
                    onClose={() => setSearchMode(null)}
                    onToggleCat={onToggleCat}
                    onClearCats={onClearCats}
                    onCommitSearch={(q) => {
                        onCommitSearch(q);
                        setSearchMode(null);
                    }}
                    onLocateAddress={(q) => {
                        onLocateAddress(q);
                        setSearchMode(null);
                    }}
                />
            )}
        </div>
    );
}

/* Bottom-center switcher — Θέματα · Δήμοι. The active tab shows a chevron: ▲ expanded (tap to
   hide the list), ▼ collapsed (tap to reveal it). */
function MobileViewSwitch({
    tab,
    collapsed,
    onSelect,
}: {
    tab: 'subjects' | 'municipalities';
    collapsed: boolean;
    onSelect: (v: 'subjects' | 'municipalities') => void;
}) {
    const t = useTranslations('landingV2');
    const items = ['subjects', 'municipalities'] as const;
    return (
        <div className="absolute bottom-[10px] left-1/2 z-[10] -translate-x-1/2">
            <div className="flex items-center gap-1 rounded-full border border-black/40 bg-card p-1 shadow-lg">
                {items.map((v) => {
                    const active = tab === v;
                    return (
                        <button
                            key={v}
                            type="button"
                            onClick={() => onSelect(v)}
                            aria-pressed={active}
                            className={cn(
                                'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                                active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t(`nav.${v}`)}
                            {active &&
                                (collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* Δήμοι list — the same horizontally-scrolled card style as the subjects strip, but for
   municipalities. A card opens its δήμος's page; its "Στον χάρτη" chip filters the map to the
   δήμος (orange outline) — the tab itself never touches the map view. A petition CTA closes the
   strip. */
function MobileMunicipalityStrip({
    cities,
    subjectCountByCity,
    upcoming,
    selectedCityId,
    onShowOnMap,
    petitionedCities,
    petitionedBelowThreshold,
    onOpenPetitioned,
}: {
    cities: LandingListCity[];
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
    /** the currently filter-selected δήμος — gets the orange outline */
    selectedCityId: string | null;
    /** out-of-network δήμοι with enough petitions — thin leaderboard cards at the strip's end */
    petitionedCities: LandingPetitionedCity[];
    /** δήμοι with petitions under the display threshold — aggregate count only */
    petitionedBelowThreshold: number;
    onOpenPetitioned: (city: LandingPetitionedCity) => void;
    /** the "Στον χάρτη" chip — filter the map to that δήμος (a second tap clears it) */
    onShowOnMap: (id: string) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    // Scroll the selected δήμος into view (centred) when it changes — or once the cards first render
    // (so switching to the tab with a δήμος already selected lands on it). Deferred a frame so the
    // horizontal layout is settled first.
    useEffect(() => {
        const root = scrollRef.current;
        if (!selectedCityId || !root) return;
        const raf = requestAnimationFrame(() => {
            const el = root.querySelector<HTMLElement>(`[data-city-id="${CSS.escape(selectedCityId)}"]`);
            if (!el) return;
            root.scrollLeft = Math.max(0, el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2);
        });
        return () => cancelAnimationFrame(raf);
    }, [selectedCityId, cities.length]);

    // No early return on an empty `cities`: the petitioned leaderboard and the petition CTA must
    // render regardless — in a young deployment they may be the only content this strip has.
    return (
        <div
            ref={scrollRef}
            // One fixed height, every card filling it. The scroller takes the touch across its
            // whole height, so a card taller than the rest (the leaderboard used to be) turned a
            // band of map into strip: a pan there scrolled the cards instead of the map.
            className="flex h-[148px] items-stretch gap-3 overflow-x-auto px-3 py-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
        >
            {cities.map((c) => (
                <MunicipalityCard
                    key={c.id}
                    city={c}
                    subjectCount={subjectCountByCity[c.id] ?? 0}
                    next={upcoming.find((m) => m.cityId === c.id)}
                    selected={selectedCityId === c.id}
                    onShowOnMap={onShowOnMap}
                    variant="strip"
                />
            ))}
            {/* petitioned-δήμοι leaderboard — one card holding the whole ranking + the tail line.
                Shown even with no ranked rows: the below-threshold tail may be the only signal. */}
            {(petitionedCities.length > 0 || petitionedBelowThreshold > 0) && (
                <PetitionedStripLeaderboard
                    cities={petitionedCities}
                    belowThreshold={petitionedBelowThreshold}
                    onOpen={onOpenPetitioned}
                />
            )}
            {/* "Δεν βλέπεις τον δήμο σου;" — same CTA as the desktop Δήμοι list */}
            <div className="flex w-[220px] shrink-0 items-center">
                <PetitionCta source="municipalities_list" />
            </div>
        </div>
    );
}

/* How many ranked rows the mobile leaderboard card shows. The card has the strip's fixed height
   (and nested vertical scroll inside a horizontal strip is miserable on touch), so past this the
   remainder folds into an honest "και N ακόμα δήμοι με 10+ αιτήματα" line. */
const MOBILE_LEADERBOARD_MAX_ROWS = 3;

/* The petitioned-δήμοι leaderboard as ONE strip card: header, the top ranked rows (rank · name ·
   "N+" badge on the petition ramp), an overflow line when the ranking is longer than the card,
   and the "και N ακόμα δήμοι…" below-threshold tail. Deliberately a single compact card so it
   reads as one sidebar of the strip, not a parade of near-empty cards. Tapping a row focuses
   that δήμος on the map (collapsing the strip), same as its blue bubble. */
function PetitionedStripLeaderboard({
    cities,
    belowThreshold,
    onOpen,
}: {
    cities: LandingPetitionedCity[];
    /** δήμοι with petitions under the display threshold — an aggregate count, never a list */
    belowThreshold: number;
    onOpen: (city: LandingPetitionedCity) => void;
}) {
    const t = useTranslations('landingV2');
    const overflow = cities.length - MOBILE_LEADERBOARD_MAX_ROWS;
    return (
        // The strip's height, like every card in it (see MobileMunicipalityStrip); the row cap is
        // what keeps the content inside, overflow-hidden is the guard.
        <div className="flex h-full w-[230px] shrink-0 flex-col gap-1.5 overflow-hidden rounded-2xl border border-black/30 bg-card p-3 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('municipality.petitionedTitle')}
            </div>
            <div className="flex flex-col gap-0.5">
                {/* server order IS the ranking — rows shared with the desktop leaderboard */}
                {cities.slice(0, MOBILE_LEADERBOARD_MAX_ROWS).map((c, i) => (
                    <PetitionedRow key={c.id} city={c} rank={i + 1} onOpen={onOpen} dense />
                ))}
            </div>
            {/* room for one tail line at this height: the ranking's own overflow (δήμοι at the
                threshold or past it) matters more than the below-threshold footnote, which the
                desktop leaderboard still carries */}
            {overflow > 0 ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                    {t('municipality.petitionedOverflow', { count: overflow, threshold: PETITION_DISPLAY_THRESHOLD })}
                </p>
            ) : belowThreshold > 0 ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                    {t('municipality.petitionedMore', { count: belowThreshold, threshold: PETITION_DISPLAY_THRESHOLD })}
                </p>
            ) : null}
        </div>
    );
}

/* OpenCouncil preview (mobile) — the "this is our office" card from the map badge. */
function MobileExplainPreview({ onClose }: { onClose: () => void }) {
    const t = useTranslations('landingV2');
    return (
        <div className="absolute inset-x-3 bottom-[10px] z-[9]">
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
                    <span className="text-xs text-muted-foreground">{t('explain.body')}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[hsl(var(--orange))]">
                        {t('common.learnMore')} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                </Link>
            </div>
        </div>
    );
}
