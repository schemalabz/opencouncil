'use client';

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from 'react';
import Image from 'next/image';
import { createRoot, type Root } from 'react-dom/client';
import mapboxgl, { type Map as MapboxMap } from 'mapbox-gl';
import {
    Search,
    MapPin,
    Bell,
    ArrowRight,
    ArrowLeft,
    LocateFixed,
    Clock,
    X,
    CalendarDays,
    ChevronDown,
    Check,
    LogIn,
    User,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import type { Topic } from '@prisma/client';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useTopics } from '@/hooks/useTopics';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Map, { type MapFeature } from '@/components/map/map';
import Icon from '@/components/icon';
import { formatDate, formatDateTime } from '@/lib/formatters/time';
import { Eyebrow } from './shared';
import {
    BrandMark,
    TopicChip,
    HotTag,
    FilterBar,
    ControlButton,
    ZoomGroup,
    CompactTopicCard,
    EditorialCard,
    type CatValue,
} from './conceptShared';
import {
    SEARCH_KEYWORDS,
    toLandingSubjects,
    type LandingCity,
    type LandingSubject,
    type MapSubject,
    type UpcomingMeeting,
} from './landingData';

// Default view over the Attica cluster (Mapbox expects [lng, lat]).
const DEFAULT_VIEW: { center: [number, number]; zoom: number } = {
    center: [23.792, 37.998],
    zoom: 12.5,
};

type FlyTarget = GeoJSON.Point | null;
type PanelTab = 'topics' | 'municipalities';

/** Date-range options for subject filtering — days first, months for the long view. */
const DATE_RANGES = [
    { key: '7d', label: '7 ημέρες', menuLabel: 'Τελευταίες 7 ημέρες', query: 'daysBack=7' },
    { key: '14d', label: '14 ημέρες', menuLabel: 'Τελευταίες 14 ημέρες', query: 'daysBack=14' },
    { key: '30d', label: '30 ημέρες', menuLabel: 'Τελευταίες 30 ημέρες', query: 'daysBack=30' },
    { key: '3m', label: '3 μήνες', menuLabel: 'Τελευταίοι 3 μήνες', query: 'monthsBack=3' },
    { key: '6m', label: '6 μήνες', menuLabel: 'Τελευταίοι 6 μήνες', query: 'monthsBack=6' },
    { key: '12m', label: '12 μήνες', menuLabel: 'Τελευταίοι 12 μήνες', query: 'monthsBack=12' },
    { key: 'all', label: 'Όλο το διάστημα', menuLabel: 'Όλο το διάστημα', query: 'allTime=true' },
] as const;
type DateRangeKey = (typeof DATE_RANGES)[number]['key'];
const DEFAULT_RANGE: DateRangeKey = '6m';

/* date-range dropdown — badge-style pill, same look as the topic filter pills */
function DateRangePill({ value, onChange }: { value: DateRangeKey; onChange: (v: DateRangeKey) => void }) {
    const current = DATE_RANGES.find((r) => r.key === value) ?? DATE_RANGES[0];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 text-[13px] font-medium text-muted-foreground shadow-md transition-colors hover:border-foreground/30"
                >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {current.label}
                    <ChevronDown className="h-3.5 w-3.5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                {DATE_RANGES.map((r) => (
                    <DropdownMenuItem
                        key={r.key}
                        onSelect={() => onChange(r.key)}
                        className={cn('gap-2', r.key === value && 'font-semibold')}
                    >
                        <Check className={cn('h-4 w-4', r.key === value ? 'opacity-100' : 'opacity-0')} />
                        {r.menuLabel}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** A subject's HTML map marker: the badge button, its React root and the Mapbox handle. */
type SubjectPin = { el: HTMLButtonElement; rootEl: HTMLDivElement; root: Root; marker: mapboxgl.Marker; subject: LandingSubject };

/**
 * Styles a map pin like the TopicChip badge, minus the label. Mapbox positions the
 * marker root via inline transform, so the scale/border styling goes on the inner
 * button and only z-index touches the root.
 */
function stylePin({ el, rootEl }: { el: HTMLButtonElement; rootEl: HTMLDivElement }, subject: LandingSubject, selected: boolean) {
    const color = subject.topic.color;
    el.className = cn(
        'flex cursor-pointer items-center justify-center rounded-full border shadow-md transition-transform',
        subject.hot ? 'h-9 w-9' : 'h-7 w-7',
        selected && 'scale-110',
    );
    el.style.color = color;
    // solid version of the chip's translucent tint, so map tiles don't bleed through
    el.style.backgroundColor = `color-mix(in srgb, ${color} 10%, white)`;
    el.style.borderColor = selected ? '#171A20' : `${color}38`;
    el.style.borderWidth = selected ? '2px' : '1px';
    rootEl.style.zIndex = selected ? '2' : subject.hot ? '1' : '0';
}

/** Props shared by the desktop and mobile layouts. */
type LayoutProps = {
    cat: CatValue;
    setCat: (v: CatValue) => void;
    range: DateRangeKey;
    setRange: (v: DateRangeKey) => void;
    topics: Topic[];
    cities: LandingCity[];
    /** geo-located subjects per cityId (for the Δήμοι cards) */
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
    loading: boolean;
    selectedId: string | null;
    selectSubject: (id: string) => void;
    clearSelection: () => void;
    selectedSubject: LandingSubject | null;
    /** filtered list for the desktop panel, hot/most-discussed first */
    ordered: LandingSubject[];
    /** unfiltered most-discussed list for the mobile sheet */
    trending: LandingSubject[];
    count: number;
    locate: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    mapNode: ReactNode;
};

/**
 * The consolidated landing redesign (issue #208). Desktop (≥ lg): the split-screen
 * map + side panel direction, with the search field and topic filters floating
 * over the map and a Θέματα / Δήμοι tabbed panel. Mobile: the immersive map-first
 * layout with a draggable trending sheet. Only one <Map> is mounted at a time.
 *
 * Data comes from the real APIs: /api/map/subjects (geo-located subjects),
 * /api/topics, /api/cities and /api/meetings/upcoming — see ./landingData.ts.
 */
export function LandingV2() {
    const [cat, setCat] = useState<CatValue>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
    const [flyTo, setFlyTo] = useState<FlyTarget>(null);

    // Default to the desktop layout during SSR (matches=false until mounted), so
    // the common desktop view has no layout flash; mobile flips in after hydration.
    const isMobile = useMediaQuery('(max-width: 1023px)');

    // The Mapbox instance — subject pins are HTML markers added onto it (so they can
    // carry the topic's lucide icon) and the zoom buttons drive it directly.
    const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
    const handleMapReady = useCallback((m: MapboxMap) => setMapInstance(m), []);
    const pinsRef = useRef<SubjectPin[]>([]);

    // ---- real data ----
    const { topics } = useTopics();
    const [mapSubjects, setMapSubjects] = useState<MapSubject[]>([]);
    const [cities, setCities] = useState<LandingCity[]>([]);
    const [upcoming, setUpcoming] = useState<UpcomingMeeting[]>([]);
    const [loading, setLoading] = useState(true);

    const [range, setRange] = useState<DateRangeKey>(DEFAULT_RANGE);

    useEffect(() => {
        let cancelled = false;
        const get = <T,>(url: string): Promise<T[]> =>
            fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        Promise.all([
            get<LandingCity>('/api/cities'),
            get<UpcomingMeeting>('/api/meetings/upcoming'),
        ]).then(([allCities, upcomingMeetings]) => {
            if (cancelled) return;
            setCities(allCities);
            setUpcoming(upcomingMeetings);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Subjects refetch whenever the date range changes.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const { query } = DATE_RANGES.find((r) => r.key === range) ?? DATE_RANGES[0];
        fetch(`/api/map/subjects?${query}`)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
            .then((subjects: MapSubject[]) => {
                if (cancelled) return;
                setMapSubjects(subjects);
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [range]);

    const allSubjects = useMemo(
        () => toLandingSubjects(mapSubjects, Object.fromEntries(cities.map((c) => [c.id, c.name]))),
        [mapSubjects, cities],
    );
    const subjectCountByCity = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const s of allSubjects) counts[s.cityId] = (counts[s.cityId] ?? 0) + 1;
        return counts;
    }, [allSubjects]);

    const visibleSubjects = useMemo(
        () => (cat === 'all' ? allSubjects : allSubjects.filter((s) => s.topicId === cat)),
        [allSubjects, cat],
    );
    const ordered = useMemo(
        () => [...visibleSubjects].sort((a, b) => Number(b.hot) - Number(a.hot) || b.durationMin - a.durationMin),
        [visibleSubjects],
    );
    const trending = useMemo(
        () => [...allSubjects].sort((a, b) => b.durationMin - a.durationMin),
        [allSubjects],
    );
    const selectedSubject = allSubjects.find((s) => s.id === selectedId) ?? null;

    const selectSubject = (id: string) => {
        setSelectedId(id);
        const s = allSubjects.find((x) => x.id === id);
        if (s) setFlyTo({ type: 'Point', coordinates: [s.lng, s.lat] });
    };
    const clearSelection = () => setSelectedId(null);

    const locate = () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                setGeo({ lat, lng });
                setFlyTo({ type: 'Point', coordinates: [lng, lat] });
            },
            () => {
                // denied/unavailable — leave the map where it is
            },
            { enableHighAccuracy: true, timeout: 8000 },
        );
    };

    const zoomIn = () => mapInstance?.zoomIn();
    const zoomOut = () => mapInstance?.zoomOut();

    // The "you are here" puck — subject pins are HTML markers (see the effect below),
    // so the <Map> feature layer only carries the geo dot. strokeWidth is the radius.
    const features: MapFeature[] = useMemo(() => {
        if (!geo) return [];
        return [
            {
                id: '__geo__',
                geometry: { type: 'Point', coordinates: [geo.lng, geo.lat] },
                properties: { kind: 'geo' },
                style: { fillColor: '#2A6FDB', fillOpacity: 1, strokeColor: '#ffffff', strokeWidth: 8, strokeOpacity: 1 },
            },
        ];
    }, [geo]);

    // Refs so the pin-building effect doesn't rebuild markers on every selection change.
    const selectedIdRef = useRef<string | null>(null);
    selectedIdRef.current = selectedId;
    const selectSubjectRef = useRef(selectSubject);
    selectSubjectRef.current = selectSubject;

    // Build one icon-badge marker per visible subject; rebuilt when the topic
    // filter (or the fetched data) changes the visible set.
    useEffect(() => {
        if (!mapInstance) return;
        const pins: SubjectPin[] = visibleSubjects.map((s) => {
            const rootEl = document.createElement('div');
            const el = document.createElement('button');
            el.type = 'button';
            el.setAttribute('aria-label', s.title);
            rootEl.appendChild(el);
            stylePin({ el, rootEl }, s, s.id === selectedIdRef.current);
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                selectSubjectRef.current(s.id);
            });
            const root = createRoot(el);
            root.render(<Icon name={s.topic.icon || 'hash'} color={s.topic.color} size={s.hot ? 18 : 14} />);
            const marker = new mapboxgl.Marker({ element: rootEl }).setLngLat([s.lng, s.lat]).addTo(mapInstance);
            return { el, rootEl, root, marker, subject: s };
        });
        pinsRef.current = pins;
        return () => {
            pinsRef.current = [];
            pins.forEach(({ marker, root }) => {
                marker.remove();
                // unmount async — React forbids unmounting a root mid-commit
                setTimeout(() => root.unmount(), 0);
            });
        };
    }, [mapInstance, visibleSubjects]);

    // Selection restyles the existing markers in place (no rebuild).
    useEffect(() => {
        pinsRef.current.forEach((pin) => stylePin(pin, pin.subject, pin.subject.id === selectedId));
    }, [selectedId]);

    const mapNode = (
        <Map
            className="absolute inset-0 h-full w-full"
            center={DEFAULT_VIEW.center}
            zoom={DEFAULT_VIEW.zoom}
            pitch={0}
            animateRotation={false}
            features={features}
            onMapReady={handleMapReady}
            showStreetLabels
            zoomToGeometry={flyTo}
            zoomPadding={isMobile ? 120 : 80}
        />
    );

    const layoutProps: LayoutProps = {
        cat,
        setCat,
        range,
        setRange,
        topics,
        cities,
        subjectCountByCity,
        upcoming,
        loading,
        selectedId,
        selectSubject,
        clearSelection,
        selectedSubject,
        ordered,
        trending,
        count: visibleSubjects.length,
        locate,
        zoomIn,
        zoomOut,
        mapNode,
    };

    return isMobile ? <MobileLayout {...layoutProps} /> : <DesktopLayout {...layoutProps} />;
}

/* ============================ DESKTOP LAYOUT ============================ */
function DesktopLayout({
    cat,
    setCat,
    range,
    setRange,
    topics,
    cities,
    subjectCountByCity,
    upcoming,
    loading,
    selectedId,
    selectSubject,
    ordered,
    count,
    locate,
    zoomIn,
    zoomOut,
    mapNode,
}: LayoutProps) {
    const [panelTab, setPanelTab] = useState<PanelTab>('topics');

    // Selecting a subject (e.g. clicking a map pin) brings its card into view:
    // flip to the Θέματα tab first, then scroll once the list has rendered.
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (selectedId) setPanelTab('topics');
    }, [selectedId]);
    useEffect(() => {
        if (!selectedId || panelTab !== 'topics') return;
        listRef.current
            ?.querySelector(`[data-subject-id="${selectedId}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [selectedId, panelTab]);

    // Draggable split: the list is a state-driven width, the map flexes to fill the rest.
    const MAP_MIN = 360;
    const LIST_MIN = 320;
    const splitRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ startX: number; startW: number } | null>(null);
    const [listWidth, setListWidth] = useState(440);

    const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startW: listWidth };
    };
    const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        const containerW = splitRef.current?.clientWidth ?? 1200;
        const max = Math.max(LIST_MIN, containerW - MAP_MIN);
        // Dragging the divider left grows the list; right grows the map.
        const next = drag.current.startW - (e.clientX - drag.current.startX);
        setListWidth(Math.min(Math.max(next, LIST_MIN), max));
    };
    const onResizeUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const nextMeeting = upcoming[0];

    return (
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-muted">
            <nav className="flex h-16 shrink-0 items-center gap-5 border-b border-border bg-card px-6">
                <BrandMark />
                <div className="ml-1 hidden items-center gap-5 text-sm font-medium text-muted-foreground xl:flex">
                    <span>Δήμοι</span>
                    <span>Σχετικά</span>
                </div>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="hidden gap-2 sm:inline-flex">
                    <Bell className="h-4 w-4" /> Ειδοποιήσεις
                </Button>
                <Button size="sm">Σύνδεση</Button>
            </nav>

            <div ref={splitRef} className="flex min-h-0 flex-1">
                {/* MAP side — flexes to fill the space left by the (resizable) list */}
                <div className="relative min-w-0 flex-1">
                    {mapNode}

                    {/* floating search + date range + topic filters (per the design) */}
                    <div className="pointer-events-none absolute inset-x-4 top-4 z-[6] flex flex-col gap-3">
                        <div className="pointer-events-auto flex items-center gap-2.5">
                            <div className="w-[360px] max-w-full">
                                <DesktopSearch topics={topics} cities={cities} onPickTopic={setCat} />
                            </div>
                            <DateRangePill value={range} onChange={setRange} />
                        </div>
                        <div className="pointer-events-auto overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [&_button]:shadow-md">
                            <FilterBar topics={topics} value={cat} onChange={setCat} />
                        </div>
                    </div>

                    {/* locate + zoom controls */}
                    <div className="absolute bottom-4 right-4 z-[6] flex items-end gap-2">
                        <button
                            type="button"
                            onClick={locate}
                            className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--orange))] px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-105"
                        >
                            <LocateFixed className="h-4 w-4" /> Η τοποθεσία μου
                        </button>
                        <ZoomGroup onZoomIn={zoomIn} onZoomOut={zoomOut} />
                    </div>
                </div>

                {/* draggable divider */}
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Αλλαγή πλάτους χάρτη/λίστας"
                    onPointerDown={onResizeDown}
                    onPointerMove={onResizeMove}
                    onPointerUp={onResizeUp}
                    onPointerCancel={onResizeUp}
                    className="group relative w-1.5 shrink-0 cursor-col-resize touch-none select-none bg-border transition-colors hover:bg-primary/40 active:bg-primary/60"
                >
                    {/* wider invisible hit area */}
                    <span className="absolute inset-y-0 -left-2 -right-2" />
                    {/* grip dots */}
                    <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1">
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/50 group-hover:bg-primary" />
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/50 group-hover:bg-primary" />
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/50 group-hover:bg-primary" />
                    </span>
                </div>

                {/* PANEL side — resizable, with Θέματα / Δήμοι tabs */}
                <div style={{ width: listWidth }} className="flex shrink-0 flex-col bg-muted">
                    <div className="shrink-0 border-b border-border bg-card px-6 py-4">
                        <PanelTabs value={panelTab} onChange={setPanelTab} />
                        {panelTab === 'topics' && (
                            <div className="mt-4 flex items-baseline justify-between gap-3">
                                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                    Θέματα κοντά σου{' '}
                                    <span className="font-mono text-base font-semibold tabular-nums text-muted-foreground">· {count}</span>
                                </h1>
                            </div>
                        )}
                        {panelTab === 'municipalities' && (
                            <div className="mt-4 flex items-baseline justify-between gap-3">
                                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                    Συνεργαζόμενοι Δήμοι
                                    <span className="font-mono text-base font-semibold tabular-nums text-muted-foreground">· {cities.length}</span>
                                </h1>
                            </div>
                        )}
                    </div>

                    {panelTab === 'topics' ? (
                        <>
                            <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
                                {nextMeeting && <NextMeetingStrip meeting={nextMeeting} />}
                                {loading && <ListNote>Φόρτωση θεμάτων…</ListNote>}
                                {!loading && count === 0 && <ListNote>Δεν βρέθηκαν θέματα με τοποθεσία.</ListNote>}
                                {ordered.map((s) => (
                                    // scroll-mt leaves a breather above the card when scrollIntoView aligns it to the top
                                    <div key={s.id} data-subject-id={s.id} className="scroll-mt-4">
                                        <EditorialCard subject={s} selected={s.id === selectedId} onClick={() => selectSubject(s.id)} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-6 py-3">
                                <span className="text-sm text-muted-foreground">
                                    Εμφανίζονται {count} θέματα
                                </span>
                                <Button variant="ghost" size="sm" className="gap-2">
                                    Δες όλα τα θέματα <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
                            {cities.map((c) => (
                                <MuniPanelCard
                                    key={c.id}
                                    city={c}
                                    subjectCount={subjectCountByCity[c.id] ?? 0}
                                    next={upcoming.find((m) => m.cityId === c.id)}
                                />
                            ))}
                            <PetitionCta />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ListNote({ children }: { children: ReactNode }) {
    return <div className="py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

/* Θέματα / Δήμοι segmented tabs (desktop panel) */
function PanelTabs({ value, onChange }: { value: PanelTab; onChange: (v: PanelTab) => void }) {
    const items: Array<{ k: PanelTab; label: string }> = [
        { k: 'topics', label: 'Θέματα' },
        { k: 'municipalities', label: 'Δήμοι' },
    ];
    return (
        <div className="flex gap-2.5 w-fit">
            {items.map(({ k, label }) => (
                <button
                    key={k}
                    type="button"
                    onClick={() => onChange(k)}
                    className={cn(
                        'px-4 py-2 flex-1 rounded-xl border-2 bg-card text-sm font-semibold transition-colors',
                        value === k
                            ? 'border-[hsl(var(--orange))] text-[hsl(var(--orange))]'
                            : 'border-border text-foreground/80 hover:border-foreground/30',
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

/** Days from now until the given date, rounded up (e.g. tomorrow evening → 2). */
function daysUntil(date: Date): number {
    return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

function NextMeetingStrip({ meeting }: { meeting: UpcomingMeeting }) {
    const date = new Date(meeting.dateTime);
    const inDays = daysUntil(date);
    return (
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
                    Επόμενη συνεδρίαση · {inDays === 0 ? 'σήμερα' : inDays === 1 ? 'αύριο' : `σε ${inDays} ημέρες`}
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
                    {meeting.city.name} — {formatDateTime(date)}
                </div>
            </div>
            <Button size="sm" className="shrink-0">
                Υπενθύμιση
            </Button>
        </div>
    );
}

/* city avatar — logo when available, first letter otherwise */
function CityAvatar({ city, size = 9 }: { city: { name: string; logoImage: string | null }; size?: number }) {
    if (city.logoImage) {
        return (
            <span className={`relative h-${size} w-${size} flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card`}>
                <Image src={city.logoImage} alt={city.name} width={36} height={36} className="h-full w-full object-contain" />
            </span>
        );
    }
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            {city.name[0]}
        </span>
    );
}

/* δήμος card (Δήμοι tab) — stats + next meeting, links to the municipality page */
function MuniPanelCard({
    city,
    subjectCount,
    next,
}: {
    city: LandingCity;
    subjectCount: number;
    next?: UpcomingMeeting;
}) {
    return (
        <Link
            href={`/${city.id}`}
            className="flex shrink-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-foreground/20"
        >
            <div className="flex items-center gap-2.5">
                <CityAvatar city={city} />
                <span className="flex-1 text-lg font-bold tracking-tight text-foreground">{city.name}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <MuniStat label="Θέματα" value={subjectCount} />
                <MuniStat label="Συνεδριάσεις" value={city._count.councilMeetings} />
                <MuniStat label="Πρόσωπα" value={city._count.persons} />
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                {next ? (
                    <span className="truncate">
                        <span className="font-medium text-foreground/80">Επόμενη συνεδρίαση:</span>{' '}
                        {formatDateTime(new Date(next.dateTime))}
                    </span>
                ) : (
                    'Καμία προγραμματισμένη συνεδρίαση'
                )}
            </div>
        </Link>
    );
}

function MuniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg bg-muted/60 px-2.5 py-2">
            <div className="font-mono text-lg font-bold tabular-nums leading-none text-foreground">{value}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
        </div>
    );
}

/* petition CTA (Δήμοι tab footer) */
function PetitionCta() {
    return (
        <Link
            href="/petition"
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
            Δεν βλέπεις τον δήμο σου; <ArrowRight className="h-4 w-4" />
        </Link>
    );
}

/** Initials from a full name — first + last word (e.g. "Βάσια Κουμαριανού" → "ΒΚ"). */
function initialsOf(name?: string | null): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ============================ MOBILE LAYOUT ============================ */
function MobileLayout({
    cat,
    setCat,
    range,
    setRange,
    topics,
    cities,
    selectedId,
    selectSubject,
    clearSelection,
    selectedSubject,
    trending,
    loading,
    locate,
    zoomIn,
    zoomOut,
    mapNode,
}: LayoutProps) {
    const [searchOpen, setSearchOpen] = useState(false);
    const { data: session } = useSession();

    // Live sheet position so the subject preview can sit on the sheet's top edge.
    // 326 matches the sheet's initial half-snap height before it first reports.
    const [sheetPos, setSheetPos] = useState({ height: 326, dragging: false });

    return (
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
            {/* header: logo + inline search pill + avatar */}
            <div className="flex items-center gap-2.5 px-4 py-2.5">
                <Link href="/" className="shrink-0">
                    <Image src="/logo.png" alt="OpenCouncil" width={120} height={120} className="h-9 w-auto object-contain" priority />
                </Link>
                <SearchPill onClick={() => setSearchOpen(true)} />
                {session?.user ? (
                    <span
                        title={session.user.name ?? undefined}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                    >
                        {initialsOf(session.user.name) || <User className="h-4 w-4" />}
                    </span>
                ) : (
                    <Link
                        href="/sign-in"
                        aria-label="Σύνδεση"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                    >
                        <LogIn className="h-4 w-4" />
                    </Link>
                )}
            </div>

            {/* map + floating overlays */}
            <div className="relative min-h-0 flex-1">
                {mapNode}

                {/* floating date range + topic chips (Google-Maps style) */}
                <div
                    className="absolute inset-x-0 top-3 z-[7] overflow-x-auto px-3 pb-1.5 [&::-webkit-scrollbar]:hidden [&_button]:shadow-md"
                    style={{ scrollbarWidth: 'none' }}
                >
                    <div className="flex w-max items-center gap-2">
                        <DateRangePill value={range} onChange={setRange} />
                        <FilterBar topics={topics} value={cat} onChange={setCat} />
                    </div>
                </div>

                {/* controls (below the chips) */}
                <div className="absolute right-3 top-16 z-[6] flex flex-col gap-2">
                    <ControlButton onClick={locate} label="Η τοποθεσία μου" accent>
                        <LocateFixed className="h-4 w-4" />
                    </ControlButton>
                    <ZoomGroup onZoomIn={zoomIn} onZoomOut={zoomOut} />
                </div>

                {/* subject preview card — sticks to the top edge of the sheet, riding along as it's dragged */}
                {selectedSubject && (
                    <MobileSubjectPreview
                        subject={selectedSubject}
                        onClose={clearSelection}
                        bottom={sheetPos.height + 8}
                        animate={!sheetPos.dragging}
                    />
                )}

                {/* draggable bottom sheet (drag fully down to dismiss) */}
                <MobileTrendingSheet
                    trending={trending}
                    loading={loading}
                    selectedId={selectedId}
                    onSelect={selectSubject}
                    onPositionChange={setSheetPos}
                />
            </div>

            {searchOpen && (
                <MobileSearchOverlay
                    topics={topics}
                    cities={cities}
                    onClose={() => setSearchOpen(false)}
                    onPickTopic={(t) => {
                        setCat(t);
                        setSearchOpen(false);
                    }}
                />
            )}
        </div>
    );
}

/* compact subject preview (mobile) — anchored just above the bottom sheet; `bottom`
   tracks the sheet height, animating in sync with its snap transition unless dragging */
function MobileSubjectPreview({
    subject,
    onClose,
    bottom,
    animate,
}: {
    subject: LandingSubject;
    onClose: () => void;
    bottom: number;
    animate: boolean;
}) {
    return (
        <div
            className="absolute inset-x-3 z-[9]"
            // min() keeps the card inside the map region when the sheet is dragged to full
            style={{ bottom: `min(${bottom}px, calc(100% - 170px))`, transition: animate ? 'bottom 250ms ease' : 'none' }}
        >
            <div className="relative rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Κλείσιμο"
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                    <X className="h-4 w-4" />
                </button>
                <Link href={subject.href} className="flex items-stretch gap-3 p-3 pr-9">
                    <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: subject.topic.color }} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-2">
                            <TopicChip topic={subject.topic} small />
                            {subject.hot && <HotTag />}
                        </span>
                        <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
                            {subject.title}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            {subject.where && (
                                <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                                    <MapPin className="h-3 w-3" /> {subject.where}
                                </span>
                            )}
                            <span aria-hidden className="opacity-40">·</span>
                            <span className="font-mono tabular-nums">{subject.cityName}</span>
                            {subject.durationMin > 0 && (
                                <>
                                    <span aria-hidden className="opacity-40">·</span>
                                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                                        <Clock className="h-3 w-3" /> {subject.durationMin}′ συζήτηση
                                    </span>
                                </>
                            )}
                        </span>
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[hsl(var(--orange))]">
                            Δες τη συζήτηση <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                    </span>
                </Link>
            </div>
        </div>
    );
}

/* draggable mobile trending sheet — snaps between collapsed peek, half and full */
function MobileTrendingSheet({
    trending,
    loading,
    selectedId,
    onSelect,
    onPositionChange,
}: {
    trending: LandingSubject[];
    loading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
    /** reports the sheet's height/drag state so siblings (the subject preview) can track it */
    onPositionChange?: (pos: { height: number; dragging: boolean }) => void;
}) {
    const MIN_H = 36; // dragged fully down — only the grab handle shows
    const rootRef = useRef<HTMLDivElement>(null);
    const inited = useRef(false);
    const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
    const [bounds, setBounds] = useState({ half: 326, full: 326 });
    const [height, setHeight] = useState(326);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        onPositionChange?.({ height, dragging });
    }, [height, dragging, onPositionChange]);

    // Measure the map region (the sheet's offset parent) to derive snap points.
    useEffect(() => {
        const el = rootRef.current?.parentElement;
        if (!el) return;
        const measure = () => {
            const regionH = el.clientHeight;
            const full = Math.max(MIN_H, regionH - 8);
            const half = Math.min(326, Math.max(MIN_H, Math.round(regionH * 0.52)));
            setBounds({ half, full });
            if (!inited.current) {
                setHeight(half);
                inited.current = true;
            } else {
                setHeight((h) => Math.min(h, full));
            }
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Drop the sheet out of the way when a subject is selected, so its preview card is the focus.
    useEffect(() => {
        if (selectedId) setHeight(MIN_H);
    }, [selectedId]);

    const snaps = useMemo(
        () => Array.from(new Set([MIN_H, bounds.half, bounds.full])).sort((a, b) => a - b),
        [bounds],
    );
    const snapNearest = (h: number) =>
        snaps.reduce((best, s) => (Math.abs(s - h) < Math.abs(best - h) ? s : best), snaps[0]);

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startY: e.clientY, startH: height, moved: false };
        setDragging(true);
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        const dy = drag.current.startY - e.clientY;
        if (Math.abs(dy) > 4) drag.current.moved = true;
        setHeight(Math.min(bounds.full, Math.max(MIN_H, drag.current.startH + dy)));
    };
    const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        const { moved, startH } = drag.current;
        if (moved) {
            setHeight((h) => snapNearest(h));
        } else {
            // Tap with no real drag → cycle to the next snap point (wraps at the top).
            const idx = snaps.indexOf(snapNearest(startH));
            setHeight(snaps[(idx + 1) % snaps.length]);
        }
        drag.current = null;
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const expanded = height > MIN_H + 8;

    return (
        <div
            ref={rootRef}
            className="absolute inset-x-0 bottom-0 z-[8] flex flex-col overflow-hidden rounded-t-[20px] border-t border-border bg-card shadow-[0_-8px_30px_rgba(20,28,46,0.16)]"
            style={{ height, transition: dragging ? 'none' : 'height 250ms ease' }}
        >
            {/* drag surface: handle + header */}
            <div
                role="button"
                aria-expanded={expanded}
                aria-label="Σύρετε ή πατήστε για ανάπτυξη"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
            >
                <div className="flex justify-center pb-1 pt-2.5">
                    <span className="h-1.5 w-10 rounded-full bg-border" />
                </div>
                <div className="flex items-center justify-between gap-2.5 px-4 pb-2.5 pt-1">
                    <div className="min-w-0">
                        <Eyebrow className="!text-[hsl(var(--orange))]">Τάσεις · κοντά σου</Eyebrow>
                        <h2 className="mt-0.5 whitespace-nowrap text-xl font-bold tracking-tight text-foreground">
                            Πιο πολυσυζητημένα
                        </h2>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-muted-foreground">
                        Δες όλα
                    </span>
                </div>
            </div>

            <div
                className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-4 pt-0.5"
                style={{
                    maskImage: 'linear-gradient(#000 88%, transparent)',
                    WebkitMaskImage: 'linear-gradient(#000 88%, transparent)',
                }}
            >
                {loading && <div className="py-6 text-center text-sm text-muted-foreground">Φόρτωση θεμάτων…</div>}
                {trending.map((s) => (
                    <CompactTopicCard key={s.id} subject={s} selected={s.id === selectedId} onClick={() => onSelect(s.id)} />
                ))}
            </div>
        </div>
    );
}

/* mobile header search pill (opens the suggestions overlay) */
function SearchPill({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-11 flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 text-left shadow-sm"
        >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-[15px] text-muted-foreground">Αναζήτηση θέματος ή δήμου…</span>
        </button>
    );
}

/* search suggestion sections (δήμοι, κατηγορίες, δημοφιλείς αναζητήσεις) — shared by
   the mobile full-screen overlay and the desktop dropdown */
function SearchSuggestions({
    topics,
    cities,
    onPick,
    onPickTopic,
}: {
    topics: Topic[];
    cities: LandingCity[];
    /** called when any suggestion is chosen, so the host overlay/dropdown can close */
    onPick: () => void;
    onPickTopic: (topicId: string) => void;
}) {
    return (
        <>
            <Eyebrow className="block">Δήμοι</Eyebrow>
            <div className="mt-2.5 flex flex-col gap-1">
                {cities.map((c) => (
                    <Link
                        key={c.id}
                        href={`/${c.id}`}
                        onClick={onPick}
                        className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted"
                    >
                        <CityAvatar city={c} />
                        <span className="flex-1 text-[15px] font-medium text-foreground">{c.name}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                ))}
            </div>

            <Eyebrow className="mt-7 block">Κατηγορίες</Eyebrow>
            <div className="mt-2.5 flex flex-wrap gap-2">
                {topics.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => onPickTopic(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:border-foreground/30"
                    >
                        <Icon name={t.icon || 'hash'} color={t.colorHex} size={14} />
                        {t.name}
                    </button>
                ))}
            </div>

            <Eyebrow className="mt-7 block">Δημοφιλείς αναζητήσεις</Eyebrow>
            <div className="mt-2.5 flex flex-wrap gap-2">
                {SEARCH_KEYWORDS.map((k) => (
                    <button
                        key={k}
                        type="button"
                        onClick={onPick}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30"
                    >
                        <Search className="h-3.5 w-3.5" /> {k}
                    </button>
                ))}
            </div>
        </>
    );
}

/* desktop search — mobile-style rounded pill; focusing it drops down the suggestions */
function DesktopSearch({
    topics,
    cities,
    onPickTopic,
}: {
    topics: Topic[];
    cities: LandingCity[];
    onPickTopic: (topicId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape while open.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <label className="flex h-11 items-center gap-2.5 rounded-full border border-border bg-card px-4 shadow-lg focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                    className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
                    placeholder="Αναζήτηση θέματος, δρόμου ή απόφασης…"
                    onFocus={() => setOpen(true)}
                />
                <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    ⌘K
                </kbd>
            </label>
            {open && (
                <div className="absolute inset-x-0 top-[calc(100%+8px)] max-h-[min(560px,calc(100dvh-220px))] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl">
                    <SearchSuggestions
                        topics={topics}
                        cities={cities}
                        onPick={() => setOpen(false)}
                        onPickTopic={(t) => {
                            onPickTopic(t);
                            setOpen(false);
                        }}
                    />
                </div>
            )}
        </div>
    );
}

/* full-screen search suggestions (mobile) — δήμοι, κατηγορίες, δημοφιλείς αναζητήσεις */
function MobileSearchOverlay({
    topics,
    cities,
    onClose,
    onPickTopic,
}: {
    topics: Topic[];
    cities: LandingCity[];
    onClose: () => void;
    onPickTopic: (topicId: string) => void;
}) {
    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Πίσω"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <label className="flex h-11 flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                        autoFocus
                        className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
                        placeholder="Αναζήτηση θέματος ή δήμου…"
                    />
                </label>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
                <SearchSuggestions topics={topics} cities={cities} onPick={onClose} onPickTopic={onPickTopic} />
            </div>
        </div>
    );
}
