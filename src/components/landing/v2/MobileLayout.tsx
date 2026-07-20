'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, HelpCircle, Loader2, LocateFixed, CalendarDays, MapPin, Bell, Clock, Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { formatDate, formatDateTime } from '@/lib/formatters/time';
import { captureLandingAction } from '@/lib/landing/analytics';
import { ListHeader } from './conceptShared';
import { subjectLocationLine, type LandingSubject, type LandingListCity, type UpcomingMeeting } from '@/lib/landing/landingData';
import { hasActiveFilters, type LayoutProps } from '@/lib/landing/landingCore';
import { DateRangePill, FilterIconButton, MapStyleToggle, CityAvatar } from './controls';
import { MobileSearchOverlay } from './SearchPanel';
import { CoLocatedBox, GeneralSubjectsBox } from './mapMarkers';
import { MobileHeader } from './MobileHeader';
import { InfoPanel } from './InfoPanel';
import { PetitionCta } from './MunicipalitiesList';

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
    selectSubject,
    clearSelection,
    selectedSubject,
    trending,
    previewId,
    previewSubject,
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
    onLocateAddress,
    overviewActive,
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

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
            {mapNode}

            {/* "?" info drawer — explains the map */}
            {infoOpen && (
                <section className="absolute inset-x-3 bottom-[10px] top-[76px] z-[8] flex flex-col overflow-hidden rounded-2xl border border-black/40 bg-muted shadow-xl">
                    <ListHeader title={t('info.title')} className="bg-card" onToggle={onToggleInfo} />
                    <InfoPanel />
                </section>
            )}

            <MobileHeader onOpenSearch={() => setSearchMode('search')} searchActive={query.trim().length > 0} query={query} />

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
                            <button
                                type="button"
                                onClick={onToggleInfo}
                                aria-pressed={infoOpen}
                                aria-label={t('nav.info')}
                                className="absolute bottom-[10px] left-3 z-[10] flex h-10 w-10 items-center justify-center rounded-full border border-black/40 bg-card text-muted-foreground/60 shadow-md"
                            >
                                <HelpCircle className="h-5 w-5" />
                            </button>
                            {/* locate + satellite — hidden while the list (subjects/δήμοι) is open,
                                so they don't crowd the strip. */}
                            {listCollapsed && (
                            <div className="absolute bottom-[88px] right-3 z-[10] flex flex-col items-end gap-2">
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

                    {/* bottom band: an expanded subject · the OpenCouncil card · else the list + tabs */}
                    {selectedSubject ? (
                        <MobileSubjectExpanded
                            subject={selectedSubject}
                            // back → return to previewing this subject (re-centres the map, undoing
                            // the select up-scroll, and keeps it highlighted in the strip)
                            onClose={() => {
                                const id = selectedSubject.id;
                                clearSelection();
                                previewSubject(id);
                            }}
                            onDismiss={() => {
                                clearSelection();
                                previewSubject(null);
                                setListCollapsed(true);
                            }}
                        />
                    ) : explainOpen ? (
                        <MobileExplainPreview onClose={onCloseExplain} />
                    ) : (
                        <>
                            {/* the list (horizontal cards) sits above the tabs, only while expanded */}
                            {!listCollapsed && (
                                <div className="absolute inset-x-0 bottom-[62px] z-[9]">
                                    {tab === 'subjects' ? (
                                        <MobileSubjectStrip
                                            subjects={trending}
                                            previewId={previewId}
                                            onPreview={previewSubject}
                                            onSelect={selectSubject}
                                        />
                                    ) : (
                                        <MobileMunicipalityStrip
                                            cities={cities}
                                            subjectCountByCity={subjectCountByCity}
                                            upcoming={upcoming}
                                            selectedCityId={filters.cityIds[0] ?? null}
                                            onSelect={(id) => {
                                                // like picking the δήμος in the filters — filter to it, stay on Δήμοι
                                                setFilters({ ...filters, cityIds: filters.cityIds[0] === id ? [] : [id] });
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
                    queryKind={queryKind}
                    results={searchResults}
                    loading={loading}
                    autoFocusInput={searchMode === 'search'}
                    scrollToActiveFilter={searchMode === 'filters'}
                    onPickResult={(id) => {
                        selectSubject(id);
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

/* Bottom horizontal-scroll strip of compact subject cards. Two modes: the first tap on a card
   previews it (highlighted in its category colour, brought to the front); tapping the previewed
   card selects it (the expanded box takes over). A subject tapped on the map also previews here. */
function MobileSubjectStrip({
    subjects,
    previewId,
    onPreview,
    onSelect,
}: {
    subjects: LandingSubject[];
    previewId: string | null;
    onPreview: (id: string | null) => void;
    onSelect: (id: string) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // The previewed subject keeps its position in the list — the strip just scrolls it into view
    // (centred), without reordering. When the preview clears (e.g. zooming out drops it), the strip
    // resets to the start so the list reads from the top again.
    useEffect(() => {
        const root = scrollRef.current;
        if (!root) return;
        if (!previewId) {
            root.scrollTo({ left: 0, behavior: 'instant' });
            return;
        }
        const el = root.querySelector<HTMLElement>(`[data-id="${CSS.escape(previewId)}"]`);
        if (!el) return;
        const target = el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2;
        root.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }, [previewId]);

    if (!subjects.length) return null;
    return (
        <div
            ref={scrollRef}
            className="flex items-end gap-3 overflow-x-auto px-3 pb-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
        >
            {subjects.map((s) => (
                <StripCard
                    key={s.id}
                    subject={s}
                    active={s.id === previewId}
                    // first tap previews; tapping the already-previewed card selects it
                    onClick={() => (s.id === previewId ? onSelect(s.id) : onPreview(s.id))}
                />
            ))}
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
   municipalities. Tapping a card filters to that δήμος (orange border); the map view is never
   touched by the tab. A petition CTA closes the strip. */
function MobileMunicipalityStrip({
    cities,
    subjectCountByCity,
    upcoming,
    selectedCityId,
    onSelect,
}: {
    cities: LandingListCity[];
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
    /** the currently filter-selected δήμος — gets the orange border */
    selectedCityId: string | null;
    /** tapping the card body filters to that δήμος (the arrow still opens its page) */
    onSelect: (id: string) => void;
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

    if (!cities.length) return null;
    return (
        <div
            ref={scrollRef}
            className="flex items-stretch gap-3 overflow-x-auto px-3 pb-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
        >
            {cities.map((c) => (
                <MunicipalityCard
                    key={c.id}
                    city={c}
                    subjectCount={subjectCountByCity[c.id] ?? 0}
                    next={upcoming.find((m) => m.cityId === c.id)}
                    selected={selectedCityId === c.id}
                    onSelect={onSelect}
                />
            ))}
            {/* "Δεν βλέπεις τον δήμο σου;" — same CTA as the desktop Δήμοι list */}
            <div className="flex w-[220px] shrink-0 items-center">
                <PetitionCta source="municipalities_list" />
            </div>
        </div>
    );
}

/* One δήμος card in the strip — the same content as the desktop Δήμοι card (logo · name · bell ·
   stats · next meeting). Tapping the card filters to that δήμος (orange border when selected); the
   bell opens its notifications and the arrow opens its page. */
function MunicipalityCard({
    city,
    subjectCount,
    next,
    selected,
    onSelect,
}: {
    city: LandingListCity;
    subjectCount: number;
    next?: UpcomingMeeting;
    selected: boolean;
    onSelect: (id: string) => void;
}) {
    const t = useTranslations('landingV2');
    return (
        <div
            role="button"
            tabIndex={0}
            data-city-id={city.id}
            onClick={() => onSelect(city.id)}
            className={cn(
                'group flex w-[264px] shrink-0 cursor-pointer flex-col gap-2.5 rounded-2xl border bg-card p-3 shadow-md transition-colors',
                selected ? 'border-[hsl(var(--orange))] border-2' : 'border-black/20 hover:border-black/40',
            )}
        >
            <div className="flex items-center gap-2">
                <CityAvatar city={city} />
                <span className="min-w-0 flex-1 text-sm font-bold text-foreground">{city.name}</span>
                <Link
                    href={`/${city.id}/notifications`}
                    onClick={(e) => {
                        e.stopPropagation();
                        captureLandingAction('notify_cta', { surface: 'municipalities_list', city_id: city.id });
                    }}
                    aria-label={next ? t('municipality.notifyMeeting', { name: city.name }) : t('municipality.notify', { name: city.name })}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[hsl(var(--orange))] no-underline transition-colors hover:bg-muted/80 hover:no-underline"
                >
                    <Bell className="h-3.5 w-3.5" />
                </Link>
                <Link
                    href={`/${city.id}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={city.name}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground no-underline transition-transform hover:no-underline group-hover:translate-x-0.5"
                >
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
                <MuniStat label={t('municipality.subjects')} value={subjectCount} />
                <MuniStat label={t('municipality.meetings')} value={city._count.councilMeetings} />
                <MuniStat label={t('municipality.persons')} value={city._count.persons} />
            </div>
            {next && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarDays className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                        <span className="font-medium text-foreground/80">{t('municipality.nextMeeting')}</span>{' '}
                        {formatDateTime(new Date(next.dateTime))}
                    </span>
                </div>
            )}
        </div>
    );
}

function MuniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg bg-muted/60 px-2 py-1.5 text-center">
            <div className="font-mono text-base font-bold tabular-nums leading-none text-foreground">{value}</div>
            <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{label}</div>
        </div>
    );
}

/* One card in the strip: a full-width category bar, then the municipality logo + title, then
   discussion time · date · address. The previewed card (`active`) gets an outline in its category
   colour. Fixed height, so every card matches: the title clamps to two lines ("…") and the meta
   sits at the bottom. */
function StripCard({ subject, active, onClick }: { subject: LandingSubject; active: boolean; onClick: () => void }) {
    const t = useTranslations('landingV2');
    const locationLine = subjectLocationLine(subject);
    return (
        <button
            type="button"
            data-id={subject.id}
            onClick={onClick}
            className={cn(
                'flex h-[150px] w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-md transition-colors',
                !active && 'border-black/20',
                active && 'border-2'
            )}
            style={active ? { borderColor: subject.topic.color } : undefined}
        >
            {/* full-width category bar */}
            <div
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold"
                style={{ backgroundColor: `${subject.topic.color}14`, color: subject.topic.color }}
            >
                <Icon name={subject.topic.icon || 'hash'} color={subject.topic.color} size={12} />
                <span className="min-w-0 truncate">{subject.topic.name}</span>
                {/* previewed card: a right chevron hints "tap again to open" */}
                {active && <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
                {/* municipality logo + title (clamped — the card keeps a fixed height) */}
                <div className="flex items-start gap-2">
                    {subject.cityLogo && (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-card">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={subject.cityLogo} alt="" loading="lazy" className="h-full w-full object-contain" />
                        </span>
                    )}
                    <span className="line-clamp-2 min-w-0 text-sm font-bold leading-snug text-foreground">{subject.title}</span>
                </div>
                {/* pinned to the bottom so the meta lines up across cards */}
                <span className="mt-auto flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                    {subject.durationMin > 0 && (
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" /> {t('subject.discussionMinutes', { min: subject.durationMin })}
                        </span>
                    )}
                    {subject.date && (
                        <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3 shrink-0" /> {formatDate(new Date(subject.date))}
                        </span>
                    )}
                    {locationLine && (
                        <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{locationLine}</span>
                        </span>
                    )}
                </span>
            </div>
        </button>
    );
}

/* Expanded subject (mobile). The category bar (back · category), the title + municipality logo, the
   meta, and the "Προβολή θέματος" link are all pinned; only the description scrolls between the meta
   and the link. The map has already flown to the subject. */
function MobileSubjectExpanded({
    subject,
    onClose,
    onDismiss,
}: {
    subject: LandingSubject;
    /** back / title / logo → return to previewing this subject */
    onClose: () => void;
    /** the × → unselect and collapse the subjects list (back to the bare map) */
    onDismiss: () => void;
}) {
    const t = useTranslations('landingV2');
    const locationLine = subjectLocationLine(subject);
    return (
        <div
            className="absolute inset-x-3 bottom-[10px] z-[9] flex max-h-[68dvh] animate-in flex-col overflow-hidden rounded-2xl border-2 bg-card shadow-xl duration-300 fade-in slide-in-from-bottom-4"
            style={{ borderColor: subject.topic.color }}
        >
            {/* full-width category bar: back · category */}
            <div
                className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 text-xs font-bold"
                style={{ backgroundColor: `${subject.topic.color}12` }}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.back')}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <Icon name={subject.topic.icon || 'hash'} color={subject.topic.color} size={16} />
                <span className="min-w-0 flex-1 truncate" style={{ color: subject.topic.color }}>
                    {subject.topic.name}
                </span>
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={t('common.close')}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* title + municipality logo (pinned) — tapping it returns to the preview, like the back arrow */}
            <button
                type="button"
                onClick={onClose}
                aria-label={t('common.back')}
                className="flex shrink-0 items-start gap-2 px-4 pt-2.5 text-left"
            >
                {subject.cityLogo && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={subject.cityLogo} alt="" loading="lazy" className="h-full w-full object-contain" />
                    </span>
                )}
                <h3 className="text-balance text-lg font-bold leading-tight text-foreground">{subject.title}</h3>
            </button>

            {/* scrollable region — meta + description; the title above stays pinned */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {/* meta — discussion time · date · location · admin body, like the desktop card */}
                <div className="mx-4 mt-2 flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3 py-2.5">
                    {subject.durationMin > 0 && (
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                            <Clock className="h-3 w-3 shrink-0" /> {t('subject.discussionMinutes', { min: subject.durationMin })}
                        </div>
                    )}
                    {subject.date && (
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                            <CalendarDays className="h-3 w-3 shrink-0" /> {formatDate(new Date(subject.date))}
                        </div>
                    )}
                    {locationLine && (
                        <div className="flex items-start gap-1 text-xs font-medium text-foreground/80">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0">{locationLine}</span>
                        </div>
                    )}
                    {subject.bodyName && (
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                            <Landmark className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0">{subject.bodyName}</span>
                        </div>
                    )}
                </div>

                {/* description */}
                {subject.summary && (
                    <p className="px-4 py-3 text-sm leading-relaxed text-foreground/80">{subject.summary}</p>
                )}
            </div>

            {/* Δες τη συζήτηση (pinned) — an ombré fade above it hints the content scrolls beneath */}
            <div className="relative shrink-0">
                <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-card to-transparent" />
                <Link
                    href={subject.href}
                    onClick={() =>
                        captureLandingAction('subject_opened', {
                            source: 'map_preview',
                            subject_id: subject.id,
                            city_id: subject.cityId,
                        })
                    }
                    className="mx-4 mb-3 mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--orange))] no-underline hover:underline"
                >
                    {t('subject.view')} <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
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
