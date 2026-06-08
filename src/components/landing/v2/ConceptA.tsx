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
import {
    Search,
    MapPin,
    ChevronDown,
    Bell,
    Layers,
    ArrowRight,
    ArrowLeft,
    LocateFixed,
    Clock,
    X,
} from 'lucide-react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Button } from '@/components/ui/button';
import Map, { type MapFeature } from '@/components/map/map';
import { Eyebrow } from './shared';
import {
    BrandMark,
    SearchField,
    CatChip,
    HotTag,
    VoteBadge,
    SubjectExtras,
    FilterBar,
    ControlButton,
    ZoomGroup,
    CompactTopicCard,
    type CatValue,
} from './conceptShared';
import {
    CATEGORIES,
    categoryList,
    MUNICIPALITIES,
    municipalityOf,
    TOPICS,
    FAKE_GEO,
    HOT_COLOR,
    SEARCH_KEYWORDS,
    type CategoryKey,
    type Topic,
} from './conceptData';

// Default view over the Attica cluster (Mapbox expects [lng, lat]).
const DEFAULT_VIEW: { center: [number, number]; zoom: number } = {
    center: [23.792, 37.998],
    zoom: 12.4,
};

type FlyTarget = GeoJSON.Point | null;

/** Props shared by the desktop and mobile layouts. */
type LayoutProps = {
    cat: CatValue;
    setCat: (v: CatValue) => void;
    selectedId: string | null;
    selectTopic: (id: string) => void;
    clearSelection: () => void;
    selectedTopic: Topic | null;
    trending: Topic[];
    geo: { lat: number; lng: number } | null;
    locate: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    mapNode: ReactNode;
    /** screen-space position of the selected pin (desktop tethering), null if unavailable */
    pinPx: { x: number; y: number } | null;
};

/**
 * Concept A — the immersive map-first landing. The real Mapbox map (via the app's
 * <Map>) is the page; floating panels sit on top. Renders a desktop overlay layout
 * (≥ lg) or a mobile layout (map-primary with a bottom sheet) below it — only one
 * <Map> is mounted at a time. Driven by mock data (./conceptData.ts).
 */
export function ConceptA() {
    const [cat, setCat] = useState<CatValue>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
    const [flyTo, setFlyTo] = useState<FlyTarget>(null);

    // Remounting the map (via key) re-applies center/zoom — <Map> stops honoring
    // the props once the user pans, so the zoom buttons bump the key to take effect.
    const [view, setView] = useState(DEFAULT_VIEW);
    const [mapKey, setMapKey] = useState(0);

    // Map instance + the selected pin's screen position, so the desktop detail card
    // can be tethered to the clicked point and follow pans/zooms.
    const mapRef = useRef<MapboxMap | null>(null);
    const selectedIdRef = useRef<string | null>(null);
    const [pinPx, setPinPx] = useState<{ x: number; y: number } | null>(null);

    // Default to the desktop layout during SSR (matches=false until mounted), so
    // the common desktop view has no layout flash; mobile flips in after hydration.
    const isMobile = useMediaQuery('(max-width: 1023px)');

    const visibleTopics = useMemo(
        () => (cat === 'all' ? TOPICS : TOPICS.filter((t) => t.cat === cat)),
        [cat],
    );
    const trending = useMemo(() => [...TOPICS].sort((a, b) => b.count - a.count), []);
    const selectedTopic = TOPICS.find((t) => t.id === selectedId) ?? null;
    selectedIdRef.current = selectedId;

    // Project the selected topic's coordinates to screen space (desktop tethering).
    const updatePin = useCallback(() => {
        const map = mapRef.current;
        const id = selectedIdRef.current;
        const t = id ? TOPICS.find((x) => x.id === id) : null;
        if (!map || !t) {
            setPinPx(null);
            return;
        }
        const p = map.project([t.lng, t.lat]);
        setPinPx({ x: p.x, y: p.y });
    }, []);

    const handleMapReady = useCallback(
        (map: MapboxMap) => {
            mapRef.current = map;
            map.on('move', updatePin);
            map.on('resize', updatePin);
            updatePin();
        },
        [updatePin],
    );

    // Re-project whenever the selection changes.
    useEffect(() => {
        updatePin();
    }, [selectedId, updatePin]);

    const selectTopic = (id: string) => {
        setSelectedId(id);
        const t = TOPICS.find((x) => x.id === id);
        if (!t) return;
        setFlyTo({ type: 'Point', coordinates: [t.lng, t.lat] });
        // Project synchronously so the detail card appears at the pin on the first
        // render — otherwise it flashes at the fallback position for one frame.
        const map = mapRef.current;
        if (map) {
            const p = map.project([t.lng, t.lat]);
            setPinPx({ x: p.x, y: p.y });
        }
    };
    const clearSelection = () => setSelectedId(null);

    const locate = () => {
        const apply = (lat: number, lng: number) => {
            setGeo({ lat, lng });
            setFlyTo({ type: 'Point', coordinates: [lng, lat] });
        };
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => apply(pos.coords.latitude, pos.coords.longitude),
                () => apply(FAKE_GEO.lat, FAKE_GEO.lng), // denied/unavailable → faked "near me"
                { enableHighAccuracy: true, timeout: 8000 },
            );
        } else {
            apply(FAKE_GEO.lat, FAKE_GEO.lng);
        }
    };

    const applyView = (next: { center: [number, number]; zoom: number }) => {
        // The map remounts (new key) → drop the stale instance so we don't project
        // against a removed map before the new one is ready.
        mapRef.current = null;
        setPinPx(null);
        setView(next);
        setMapKey((k) => k + 1);
    };
    const zoomIn = () => applyView({ ...view, zoom: Math.min(view.zoom + 1, 18) });
    const zoomOut = () => applyView({ ...view, zoom: Math.max(view.zoom - 1, 4) });

    // Topic pins (+ a geo puck when located). strokeWidth is the circle radius.
    const features: MapFeature[] = useMemo(() => {
        const topicFeatures: MapFeature[] = visibleTopics.map((t) => {
            const selected = t.id === selectedId;
            return {
                id: t.id,
                geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
                properties: { kind: 'topic' },
                style: {
                    fillColor: t.hot ? HOT_COLOR : CATEGORIES[t.cat].color,
                    fillOpacity: 1,
                    strokeColor: selected ? '#171A20' : '#ffffff',
                    strokeWidth: (t.hot ? 11 : 6) + (selected ? 3 : 0),
                    strokeOpacity: 1,
                },
            };
        });
        if (geo) {
            topicFeatures.push({
                id: '__geo__',
                geometry: { type: 'Point', coordinates: [geo.lng, geo.lat] },
                properties: { kind: 'geo' },
                style: { fillColor: '#2A6FDB', fillOpacity: 1, strokeColor: '#ffffff', strokeWidth: 8, strokeOpacity: 1 },
            });
        }
        return topicFeatures;
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
            onMapReady={handleMapReady}
            zoomToGeometry={flyTo}
            zoomPadding={120}
        />
    );

    const layoutProps: LayoutProps = {
        cat,
        setCat,
        selectedId,
        selectTopic,
        clearSelection,
        selectedTopic,
        trending,
        geo,
        locate,
        zoomIn,
        zoomOut,
        mapNode,
        pinPx,
    };

    return isMobile ? <MobileLayout {...layoutProps} /> : <DesktopLayout {...layoutProps} />;
}

/* ============================ DESKTOP LAYOUT ============================ */
function DesktopLayout({
    cat,
    setCat,
    selectedId,
    selectTopic,
    clearSelection,
    selectedTopic,
    trending,
    geo,
    locate,
    zoomIn,
    zoomOut,
    mapNode,
    pinPx,
}: LayoutProps) {
    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-muted">
            {mapNode}

            {/* Top bar */}
            <div className="absolute inset-x-4 top-4 z-20">
                <div className="flex h-14 items-center gap-4 rounded-2xl border border-border bg-card/95 px-4 shadow-lg backdrop-blur">
                    <BrandMark />
                    <div className="h-7 w-px bg-border" />
                    <div className="min-w-0 flex-1 sm:max-w-[460px]">
                        <SearchField />
                    </div>
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        <MapPin className="h-3.5 w-3.5" /> Όλοι οι δήμοι <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" className="gap-2">
                        <Bell className="h-4 w-4" /> Ειδοποιήσεις
                    </Button>
                    <Button size="sm">Σύνδεση</Button>
                </div>
            </div>

            {/* Category filter row */}
            <div className="absolute left-[392px] right-[280px] top-[84px] z-[18]">
                <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-border bg-card/85 p-1.5 shadow-sm backdrop-blur">
                    <FilterBar value={cat} onChange={setCat} />
                </div>
            </div>

            {/* δήμοι cluster (top-right) */}
            <div className="absolute right-4 top-[84px] z-[18] w-[248px]">
                <div className="rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                    <Eyebrow className="mb-2.5 flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5" /> Δήμοι στον χάρτη
                    </Eyebrow>
                    <div className="flex flex-col gap-1.5">
                        {MUNICIPALITIES.map((m) => (
                            <MuniRow key={m.slug} slug={m.slug} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Trending rail (left) — casual Κώστας */}
            <div className="absolute bottom-4 left-4 top-[84px] z-[19] flex w-[360px] flex-col">
                <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur">
                    <TrendingHeader />
                    <div
                        className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5"
                        style={{
                            maskImage: 'linear-gradient(#000 92%, transparent)',
                            WebkitMaskImage: 'linear-gradient(#000 92%, transparent)',
                        }}
                    >
                        {trending.map((t) => (
                            <CompactTopicCard
                                key={t.id}
                                topic={t}
                                selected={t.id === selectedId}
                                onClick={() => selectTopic(t.id)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Selected-topic detail — tethered to the clicked map point */}
            {selectedTopic && <DesktopDetailAnchor pinPx={pinPx} topic={selectedTopic} onClose={clearSelection} />}

            {/* Map controls (bottom-right) */}
            <MapControls onLocate={locate} onZoomIn={zoomIn} onZoomOut={zoomOut} />

            {/* "near me" hint when no geo yet */}
            {!geo && <NearMeButton onClick={locate} className="bottom-5 right-[70px]" />}
        </div>
    );
}

/* desktop detail card, positioned at the clicked map point (falls back to bottom-left) */
function DesktopDetailAnchor({
    pinPx,
    topic,
    onClose,
}: {
    pinPx: { x: number; y: number } | null;
    topic: Topic;
    onClose: () => void;
}) {
    const CARD_W = 430;
    if (!pinPx) {
        return (
            <div className="absolute bottom-4 left-[392px] z-[21] w-[430px]">
                <TopicDetailCard topic={topic} onClose={onClose} />
            </div>
        );
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const half = CARD_W / 2;
    const left = Math.min(Math.max(pinPx.x, half + 12), vw - half - 12);
    const above = pinPx.y > 320; // enough room above the pin → sit above it, else below
    return (
        <div
            className="absolute z-[21]"
            style={{
                left,
                top: above ? pinPx.y - 18 : pinPx.y + 18,
                width: CARD_W,
                transform: `translate(-50%, ${above ? '-100%' : '0'})`,
            }}
        >
            <TopicDetailCard topic={topic} onClose={onClose} />
        </div>
    );
}

/* ============================ MOBILE LAYOUT ============================ */
function MobileLayout({
    cat,
    setCat,
    selectedId,
    selectTopic,
    clearSelection,
    selectedTopic,
    trending,
    locate,
    zoomIn,
    zoomOut,
    mapNode,
}: LayoutProps) {
    const [searchOpen, setSearchOpen] = useState(false);

    return (
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
            {/* header: logo + inline search pill + avatar */}
            <div className="flex items-center gap-2.5 px-4 py-2.5">
                <Link href="/" className="shrink-0">
                    <Image src="/logo.png" alt="OpenCouncil" width={120} height={120} className="h-9 w-auto object-contain" priority />
                </Link>
                <SearchPill onClick={() => setSearchOpen(true)} />
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    Κ
                </span>
            </div>

            {/* map + floating overlays */}
            <div className="relative min-h-0 flex-1">
                {mapNode}

                {/* floating category chips (Google-Maps style) */}
                <div
                    className="absolute inset-x-0 top-3 z-[7] overflow-x-auto px-3 pb-1.5 [&::-webkit-scrollbar]:hidden [&_button]:shadow-md"
                    style={{ scrollbarWidth: 'none' }}
                >
                    <FilterBar value={cat} onChange={setCat} />
                </div>

                {/* controls (below the chips) */}
                <div className="absolute right-3 top-16 z-[6] flex flex-col gap-2">
                    <ControlButton onClick={locate} label="Η τοποθεσία μου" accent>
                        <LocateFixed className="h-4 w-4" />
                    </ControlButton>
                    <ZoomGroup onZoomIn={zoomIn} onZoomOut={zoomOut} />
                </div>

                {/* subject preview card — appears over the map when a pin is tapped */}
                {selectedTopic && <MobileSubjectPreview topic={selectedTopic} onClose={clearSelection} />}

                {/* draggable bottom sheet (drag fully down to dismiss) */}
                <MobileTrendingSheet trending={trending} selectedId={selectedId} onSelect={selectTopic} />
            </div>

            {searchOpen && (
                <MobileSearchOverlay
                    onClose={() => setSearchOpen(false)}
                    onPickCategory={(c) => {
                        setCat(c);
                        setSearchOpen(false);
                    }}
                />
            )}
        </div>
    );
}

/* ============================ SHARED PIECES ============================ */

function TrendingHeader() {
    return (
        <div className="border-b border-border px-4 pb-3 pt-4">
            <Eyebrow className="!text-[hsl(var(--orange))]">Τάσεις της εβδομάδας</Eyebrow>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Πιο πολυσυζητημένα</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
                Θέματα που ξεχώρισαν στα τελευταία συμβούλια κοντά σου.
            </p>
        </div>
    );
}

/* compact subject preview (mobile) — floats over the map above the sheet peek */
function MobileSubjectPreview({ topic, onClose }: { topic: Topic; onClose: () => void }) {
    const m = municipalityOf(topic.muni);
    return (
        <div className="absolute inset-x-3 bottom-[52px] z-[9]">
            <div className="relative rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Κλείσιμο"
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                    <X className="h-4 w-4" />
                </button>
                <Link href={topic.href} className="flex items-stretch gap-3 p-3 pr-9">
                    <span
                        className="w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: topic.hot ? HOT_COLOR : CATEGORIES[topic.cat].color }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-2">
                            <CatChip cat={topic.cat} small />
                            {topic.hasVote && <VoteBadge />}
                            {topic.hot && <HotTag count={topic.count} />}
                        </span>
                        <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
                            {topic.title}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                                <MapPin className="h-3 w-3" /> {topic.where}
                            </span>
                            <span aria-hidden className="opacity-40">·</span>
                            <span className="font-mono tabular-nums">{m.name}</span>
                            <span aria-hidden className="opacity-40">·</span>
                            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                                <Clock className="h-3 w-3" /> {topic.durationMin}′ συζήτηση
                            </span>
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
    selectedId,
    onSelect,
}: {
    trending: Topic[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const MIN_H = 36; // dragged fully down — only the grab handle shows
    const rootRef = useRef<HTMLDivElement>(null);
    const inited = useRef(false);
    const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
    const [bounds, setBounds] = useState({ half: 326, full: 326 });
    const [height, setHeight] = useState(326);
    const [dragging, setDragging] = useState(false);

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
                {trending.map((t) => (
                    <CompactTopicCard key={t.id} topic={t} selected={t.id === selectedId} onClick={() => onSelect(t.id)} />
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

/* full-screen search suggestions (mobile) — δήμοι, κατηγορίες, δημοφιλείς αναζητήσεις */
function MobileSearchOverlay({
    onClose,
    onPickCategory,
}: {
    onClose: () => void;
    onPickCategory: (c: CategoryKey) => void;
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
                <Eyebrow className="block">Δήμοι</Eyebrow>
                <div className="mt-2.5 flex flex-col gap-1">
                    {MUNICIPALITIES.map((m) => (
                        <Link
                            key={m.slug}
                            href={m.href}
                            onClick={onClose}
                            className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                                {m.name[0]}
                            </span>
                            <span className="flex-1 text-[15px] font-medium text-foreground">{m.name}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                    ))}
                </div>

                <Eyebrow className="mt-7 block">Κατηγορίες</Eyebrow>
                <div className="mt-2.5 flex flex-wrap gap-2">
                    {categoryList.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            onClick={() => onPickCategory(c.key)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:border-foreground/30"
                        >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.short}
                        </button>
                    ))}
                </div>

                <Eyebrow className="mt-7 block">Δημοφιλείς αναζητήσεις</Eyebrow>
                <div className="mt-2.5 flex flex-wrap gap-2">
                    {SEARCH_KEYWORDS.map((k) => (
                        <button
                            key={k}
                            type="button"
                            onClick={onClose}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30"
                        >
                            <Search className="h-3.5 w-3.5" /> {k}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* selected-topic detail card */
function TopicDetailCard({ topic, onClose }: { topic: Topic; onClose: () => void }) {
    const m = municipalityOf(topic.muni);
    return (
        <div className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur">
            <button
                type="button"
                onClick={onClose}
                aria-label="Κλείσιμο"
                className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:bg-muted"
            >
                <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3 pr-7">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <CatChip cat={topic.cat} />
                        {topic.hasVote && <VoteBadge />}
                        {topic.hot && <HotTag count={topic.count} suffix="τοποθετήσεις" />}
                    </div>
                    <h3 className="text-xl font-bold leading-snug tracking-tight text-foreground">{topic.title}</h3>
                </div>
                {topic.hot && (
                    <div className="relative hidden h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-muted sm:block">
                        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_10px,hsl(var(--background))_10px_20px)]" />
                        <span className="absolute bottom-1.5 left-1.5 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                            φωτό
                        </span>
                    </div>
                )}
            </div>
            <p className="text-sm leading-relaxed text-foreground/80">{topic.summary}</p>
            <SubjectExtras topic={topic} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
                    <MapPin className="h-3.5 w-3.5" /> {topic.where}
                </span>
                <span aria-hidden className="opacity-40">·</span>
                <span className="font-mono tabular-nums">
                    {m.name} · {topic.date}
                </span>
                <span aria-hidden className="opacity-40">·</span>
                <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                    <Clock className="h-3.5 w-3.5" /> {topic.durationMin}′ συζήτηση
                </span>
            </div>
            <div className="mt-1 flex gap-2">
                <Button asChild className="flex-1">
                    <Link href={topic.href}>
                        Δες τη συζήτηση <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
                <Button variant="outline">
                    <Bell className="h-4 w-4" /> Ειδοποίησέ με
                </Button>
            </div>
        </div>
    );
}

/* δήμος row (right cluster) */
function MuniRow({ slug }: { slug: string }) {
    const m = municipalityOf(slug);
    return (
        <Link
            href={m.href}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-foreground/20 hover:bg-muted"
        >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                {m.name[0]}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{m.name}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{m.sessions} συνεδριάσεις</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
    );
}

/* map controls (geo + zoom), bottom-right */
function MapControls({
    onLocate,
    onZoomIn,
    onZoomOut,
}: {
    onLocate: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
}) {
    return (
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
            <ControlButton onClick={onLocate} label="Η τοποθεσία μου" accent>
                <LocateFixed className="h-4 w-4" />
            </ControlButton>
            <ZoomGroup onZoomIn={onZoomIn} onZoomOut={onZoomOut} />
        </div>
    );
}

/* "near me" CTA (desktop hint when no location is set yet) */
function NearMeButton({ onClick, className }: { onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'absolute z-[6] inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--orange))] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-105',
                className,
            )}
        >
            <LocateFixed className="h-4 w-4" />
            Δες τι συζητιέται κοντά μου
        </button>
    );
}
