'use client';

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { LocateFixed, Bell, ArrowRight, ChevronDown, CalendarDays, MapPin } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Map, { type MapFeature } from '@/components/map/map';
import { Eyebrow } from './shared';
import {
    BrandMark,
    SearchField,
    FilterBar,
    ControlButton,
    ZoomGroup,
    EditorialCard,
    CompactTopicCard,
    type CatValue,
} from './conceptShared';
import {
    CATEGORIES,
    categoryList,
    MUNICIPALITIES,
    municipalityOf,
    TOPICS,
    MEETINGS,
    FAKE_GEO,
    HOT_COLOR,
    type Meeting,
    type Topic,
} from './conceptData';

const DEFAULT_VIEW: { center: [number, number]; zoom: number } = {
    center: [23.792, 37.998],
    zoom: 12.5,
};

type FlyTarget = GeoJSON.Point | null;
type MobileView = 'list' | 'map';

type LayoutProps = {
    cat: CatValue;
    setCat: (v: CatValue) => void;
    selectedId: string | null;
    selectTopic: (id: string) => void;
    selectedTopic: Topic | null;
    ordered: Topic[];
    count: number;
    nextMeeting: Meeting;
    locate: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    mapNode: ReactNode;
};

/**
 * Concept C — split-screen map + synced topic list. Desktop: map on the left, a
 * filterable list on the right with a δήμοι row, an "Επόμενη συνεδρίαση" reminder and
 * a pinned footer. Mobile: a Λίστα / Χάρτης segmented toggle. Mock data only.
 */
export function ConceptC() {
    const [cat, setCat] = useState<CatValue>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
    const [flyTo, setFlyTo] = useState<FlyTarget>(null);
    const [view, setView] = useState(DEFAULT_VIEW);
    const [mapKey, setMapKey] = useState(0);
    const [mobileView, setMobileView] = useState<MobileView>('list');

    const isMobile = useMediaQuery('(max-width: 1023px)');

    const visibleTopics = useMemo(
        () => (cat === 'all' ? TOPICS : TOPICS.filter((t) => t.cat === cat)),
        [cat],
    );
    const ordered = useMemo(
        () => [...visibleTopics].sort((a, b) => Number(b.hot) - Number(a.hot) || b.count - a.count),
        [visibleTopics],
    );
    const selectedTopic = TOPICS.find((t) => t.id === selectedId) ?? null;
    const nextMeeting = MEETINGS[0];

    const selectTopic = (id: string) => {
        setSelectedId(id);
        const t = TOPICS.find((x) => x.id === id);
        if (t) setFlyTo({ type: 'Point', coordinates: [t.lng, t.lat] });
    };

    const locate = () => {
        const apply = (lat: number, lng: number) => {
            setGeo({ lat, lng });
            setFlyTo({ type: 'Point', coordinates: [lng, lat] });
        };
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => apply(pos.coords.latitude, pos.coords.longitude),
                () => apply(FAKE_GEO.lat, FAKE_GEO.lng),
                { enableHighAccuracy: true, timeout: 8000 },
            );
        } else {
            apply(FAKE_GEO.lat, FAKE_GEO.lng);
        }
    };

    const applyView = (next: { center: [number, number]; zoom: number }) => {
        setView(next);
        setMapKey((k) => k + 1);
    };
    const zoomIn = () => applyView({ ...view, zoom: Math.min(view.zoom + 1, 18) });
    const zoomOut = () => applyView({ ...view, zoom: Math.max(view.zoom - 1, 4) });

    const features: MapFeature[] = useMemo(() => {
        const fs: MapFeature[] = visibleTopics.map((t) => ({
            id: t.id,
            geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
            properties: { kind: 'topic' },
            style: {
                fillColor: t.hot ? HOT_COLOR : CATEGORIES[t.cat].color,
                fillOpacity: 1,
                strokeColor: t.id === selectedId ? '#171A20' : '#ffffff',
                strokeWidth: (t.hot ? 11 : 6) + (t.id === selectedId ? 3 : 0),
                strokeOpacity: 1,
            },
        }));
        if (geo) {
            fs.push({
                id: '__geo__',
                geometry: { type: 'Point', coordinates: [geo.lng, geo.lat] },
                properties: { kind: 'geo' },
                style: { fillColor: '#2A6FDB', fillOpacity: 1, strokeColor: '#ffffff', strokeWidth: 8, strokeOpacity: 1 },
            });
        }
        return fs;
    }, [visibleTopics, selectedId, geo]);

    const handleFeatureClick = (feature: GeoJSON.Feature) => {
        const id = feature.properties?.subjectId ?? feature.properties?.id;
        if (typeof id === 'string' && id.startsWith('t')) selectTopic(id);
    };

    const mapNode = (
        <Map
            key={mapKey}
            className="absolute inset-0 h-full w-full"
            center={view.center}
            zoom={view.zoom}
            pitch={0}
            animateRotation={false}
            features={features}
            onFeatureClick={handleFeatureClick}
            zoomToGeometry={flyTo}
            zoomPadding={80}
        />
    );

    const props: LayoutProps = {
        cat,
        setCat,
        selectedId,
        selectTopic,
        selectedTopic,
        ordered,
        count: visibleTopics.length,
        nextMeeting,
        locate,
        zoomIn,
        zoomOut,
        mapNode,
    };

    return isMobile ? (
        <MobileC {...props} mobileView={mobileView} setMobileView={setMobileView} />
    ) : (
        <DesktopC {...props} />
    );
}

/* ============================ DESKTOP ============================ */
function DesktopC({
    cat,
    setCat,
    selectedId,
    selectTopic,
    ordered,
    count,
    nextMeeting,
    locate,
    zoomIn,
    zoomOut,
    mapNode,
}: LayoutProps) {
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

    return (
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-muted">
            <nav className="flex h-16 shrink-0 items-center gap-5 border-b border-border bg-card px-6">
                <BrandMark />
                <div className="ml-1 hidden items-center gap-5 text-sm font-medium text-muted-foreground xl:flex">
                    <span className="font-semibold text-primary">Χάρτης</span>
                    <span>Θέματα</span>
                    <span>Δήμοι</span>
                    <span>OpenCouncil AI</span>
                </div>
                <div className="ml-2 hidden max-w-[360px] flex-1 md:block">
                    <SearchField />
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
                    <button
                        type="button"
                        onClick={locate}
                        className="absolute left-4 top-4 z-[6] inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--orange))] px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-105"
                    >
                        <LocateFixed className="h-4 w-4" /> Η τοποθεσία μου
                    </button>
                    <div className="absolute bottom-4 right-4 z-[6] flex flex-col gap-2">
                        <ControlButton onClick={locate} label="Η τοποθεσία μου" accent>
                            <LocateFixed className="h-4 w-4" />
                        </ControlButton>
                        <ZoomGroup onZoomIn={zoomIn} onZoomOut={zoomOut} />
                    </div>
                    <div className="absolute bottom-4 left-4 z-[6]">
                        <Legend />
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

                {/* LIST side — resizable side panel */}
                <div style={{ width: listWidth }} className="flex shrink-0 flex-col bg-muted">
                    <div className="shrink-0 border-b border-border bg-card px-6 py-4">
                        <div className="flex items-baseline justify-between gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                Θέματα κοντά σου{' '}
                                <span className="font-mono text-base font-semibold tabular-nums text-muted-foreground">· {count}</span>
                            </h1>
                            <SortPill />
                        </div>
                        <div className="mt-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                            <FilterBar value={cat} onChange={setCat} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Eyebrow className="mr-1">Δήμοι</Eyebrow>
                            {MUNICIPALITIES.map((m) => (
                                <MuniChip key={m.slug} name={m.name} />
                            ))}
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
                        <NextMeetingStrip meeting={nextMeeting} />
                        {ordered.map((t) => (
                            <EditorialCard key={t.id} topic={t} selected={t.id === selectedId} onClick={() => selectTopic(t.id)} />
                        ))}
                    </div>

                    <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-6 py-3">
                        <span className="text-sm text-muted-foreground">
                            Εμφανίζονται {Math.min(6, count)} από {count} θέματα
                        </span>
                        <Button variant="ghost" size="sm" className="gap-2">
                            Δες όλα τα θέματα <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ============================ MOBILE ============================ */
function MobileC({
    cat,
    setCat,
    selectedId,
    selectTopic,
    selectedTopic,
    ordered,
    count,
    nextMeeting,
    locate,
    zoomIn,
    zoomOut,
    mapNode,
    mobileView,
    setMobileView,
}: LayoutProps & { mobileView: MobileView; setMobileView: (v: MobileView) => void }) {
    return (
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-muted">
            {/* header */}
            <div className="shrink-0 border-b border-border bg-card px-4 pb-3 pt-3">
                <div className="mb-3 flex items-center gap-2.5">
                    <Link href="/" className="shrink-0">
                        <Image src="/logo.png" alt="OpenCouncil" width={120} height={120} className="h-9 w-auto object-contain" priority />
                    </Link>
                    <div className="flex-1" />
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        Κ
                    </span>
                </div>
                <SearchField placeholder="Αναζήτηση θέματος…" />
                <div className="mt-3">
                    <Segmented value={mobileView} onChange={setMobileView} />
                </div>
            </div>

            {mobileView === 'map' ? (
                <div className="relative min-h-0 flex-1">
                    {mapNode}
                    <button
                        type="button"
                        onClick={locate}
                        className="absolute left-3.5 top-3.5 z-[6] inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--orange))] px-3 py-2 text-[13px] font-semibold text-white shadow-lg"
                    >
                        <LocateFixed className="h-3.5 w-3.5" /> Κοντά μου
                    </button>
                    <div className="absolute right-3.5 top-3.5 z-[6]">
                        <ZoomGroup onZoomIn={zoomIn} onZoomOut={zoomOut} />
                    </div>
                    {selectedTopic && (
                        <div className="absolute inset-x-3 bottom-3 z-[6]">
                            <CompactTopicCard topic={selectedTopic} selected />
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                    {/* map strip */}
                    <div className="relative h-[188px] shrink-0 border-b border-border">
                        {mapNode}
                        <button
                            type="button"
                            onClick={locate}
                            className="absolute left-3 top-3 z-[6] inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--orange))] px-3 py-2 text-[13px] font-semibold text-white shadow-lg"
                        >
                            <LocateFixed className="h-3.5 w-3.5" /> Κοντά μου
                        </button>
                        <button
                            type="button"
                            onClick={() => setMobileView('map')}
                            className="absolute bottom-3 right-3 z-[6] inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-md"
                        >
                            <MapPin className="h-3.5 w-3.5" /> Άνοιξε χάρτη
                        </button>
                    </div>

                    {/* list */}
                    <div className="flex shrink-0 items-center justify-between gap-2.5 px-4 pb-2 pt-3">
                        <h1 className="text-lg font-bold tracking-tight text-foreground">
                            Θέματα κοντά σου{' '}
                            <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">· {count}</span>
                        </h1>
                        <SortPill compact />
                    </div>
                    <div className="shrink-0 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden">
                        <FilterBar value={cat} onChange={setCat} />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
                        <NextMeetingStrip meeting={nextMeeting} />
                        {ordered.map((t) => (
                            <EditorialCard key={t.id} topic={t} selected={t.id === selectedId} onClick={() => selectTopic(t.id)} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ============================ PIECES ============================ */

function Segmented({ value, onChange }: { value: MobileView; onChange: (v: MobileView) => void }) {
    const items: Array<{ k: MobileView; label: string }> = [
        { k: 'list', label: 'Λίστα' },
        { k: 'map', label: 'Χάρτης' },
    ];
    return (
        <div className="flex rounded-xl bg-muted p-1">
            {items.map(({ k, label }) => (
                <button
                    key={k}
                    type="button"
                    onClick={() => onChange(k)}
                    className={cn(
                        'h-8 flex-1 rounded-lg text-[13px] font-semibold transition-colors',
                        value === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function SortPill({ compact }: { compact?: boolean }) {
    return (
        <button
            type="button"
            className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background font-medium text-muted-foreground transition-colors hover:border-foreground/30',
                compact ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm',
            )}
        >
            {compact ? 'Δημοφιλή' : 'Ταξινόμηση: Δημοφιλή'} <ChevronDown className="h-3.5 w-3.5" />
        </button>
    );
}

function MuniChip({ name }: { name: string }) {
    return (
        <button
            type="button"
            className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/30"
        >
            {name}
        </button>
    );
}

function Legend() {
    return (
        <div className="rounded-xl border border-border bg-card/95 p-3 shadow-md backdrop-blur">
            <Eyebrow className="mb-2 block">Κατηγορίες</Eyebrow>
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5">
                {categoryList.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5 text-[11.5px] text-foreground/80">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} /> {c.short}
                    </div>
                ))}
            </div>
        </div>
    );
}

function NextMeetingStrip({ meeting }: { meeting: Meeting }) {
    const m = municipalityOf(meeting.muni);
    return (
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
                    Επόμενη συνεδρίαση · σε {meeting.inDays} ημέρες
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
                    {m.name} — {meeting.date}, {meeting.time}
                </div>
            </div>
            <Button size="sm" className="shrink-0">
                Υπενθύμιση
            </Button>
        </div>
    );
}
