'use client';

import { useMemo, useState } from 'react';
import { LocateFixed, ChevronDown, Bell, ArrowRight, Clock } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Map, { type MapFeature } from '@/components/map/map';
import { Eyebrow } from './shared';
import {
    BrandMark,
    SearchField,
    CatChip,
    MetaRow,
    FilterBar,
    ControlButton,
    ZoomGroup,
    EditorialCard,
    type CatValue,
} from './conceptShared';
import {
    CATEGORIES,
    MUNICIPALITIES,
    municipalityOf,
    TOPICS,
    MEETINGS,
    FAKE_GEO,
    HOT_COLOR,
    type Topic,
} from './conceptData';

const DEFAULT_VIEW: { center: [number, number]; zoom: number } = {
    center: [23.793, 37.998],
    zoom: 12.4,
};

type FlyTarget = GeoJSON.Point | null;

/**
 * Concept B — editorial map hero + scrollable content. A serif-style headline and a
 * map hero up top, then a trending grid (photos on hot topics), upcoming meetings and
 * δήμοι cards, and a footer. Fully responsive (stacks on mobile). Mock data only.
 */
export function ConceptB() {
    const [cat, setCat] = useState<CatValue>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
    const [flyTo, setFlyTo] = useState<FlyTarget>(null);
    const [view, setView] = useState(DEFAULT_VIEW);
    const [mapKey, setMapKey] = useState(0);

    const visibleTopics = useMemo(
        () => (cat === 'all' ? TOPICS : TOPICS.filter((t) => t.cat === cat)),
        [cat],
    );
    const grid = useMemo(
        () => [...visibleTopics].sort((a, b) => Number(b.hot) - Number(a.hot) || b.count - a.count).slice(0, 6),
        [visibleTopics],
    );
    const selectedTopic = TOPICS.find((t) => t.id === selectedId) ?? null;

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

    return (
        <div className="min-h-[100dvh] w-full bg-muted">
            {/* nav */}
            <nav className="sticky top-0 z-30 flex h-16 items-center gap-5 border-b border-border bg-card/85 px-4 backdrop-blur sm:px-8 lg:px-14">
                <BrandMark />
                <div className="ml-2 hidden items-center gap-5 text-sm font-medium text-muted-foreground lg:flex">
                    <span>Θέματα</span>
                    <span>Δήμοι</span>
                    <span>Χάρτης</span>
                    <span>OpenCouncil AI</span>
                </div>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="hidden gap-2 sm:inline-flex">
                    <Bell className="h-4 w-4" /> Ειδοποιήσεις
                </Button>
                <Button size="sm">Σύνδεση</Button>
            </nav>

            {/* hero */}
            <section className="grid items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[490px_1fr] lg:gap-11 lg:px-14 lg:py-12">
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground/80 shadow-sm">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CATEGORIES.env.color }} />
                        4 δήμοι · 110 συνεδριάσεις · ζωντανά
                    </div>
                    <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
                        Δες τι συζητά ο δήμος σου, <span className="text-primary">δίπλα σου.</span>
                    </h1>
                    <p className="mt-4 max-w-md text-[17px] leading-relaxed text-foreground/80">
                        Το OpenCouncil παρακολουθεί τα δημοτικά συμβούλια και τα κάνει απλά. Άνοιξε τον χάρτη και δες ποια
                        θέματα αφορούν τη γειτονιά σου.
                    </p>
                    <div className="mt-6 flex max-w-md flex-col gap-3">
                        <SearchField big placeholder="Ψάξε δρόμο, γειτονιά ή θέμα…" />
                        <div className="flex gap-2.5">
                            <Button onClick={locate} className="h-12 flex-1">
                                <LocateFixed className="h-4 w-4" /> Χρησιμοποίησε την τοποθεσία μου
                            </Button>
                            <Button variant="outline" className="h-12">
                                Διάλεξε δήμο <ChevronDown className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* hero map */}
                <div className="relative h-[360px] overflow-hidden rounded-2xl border border-border shadow-xl lg:h-[466px]">
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
                    <div className="absolute left-3.5 top-3.5 z-[5] max-w-[calc(100%-1.75rem)] overflow-x-auto rounded-full border border-border bg-card/85 p-1.5 shadow-sm backdrop-blur [&::-webkit-scrollbar]:hidden">
                        <FilterBar value={cat} onChange={setCat} />
                    </div>
                    <div className="absolute bottom-3.5 right-3.5 z-[5] flex flex-col gap-2">
                        <ControlButton onClick={locate} label="Η τοποθεσία μου" accent>
                            <LocateFixed className="h-4 w-4" />
                        </ControlButton>
                        <ZoomGroup onZoomIn={zoomIn} onZoomOut={zoomOut} />
                    </div>
                    {selectedTopic && (
                        <div className="absolute bottom-3.5 left-3.5 z-[6] w-[280px] max-w-[calc(100%-1.75rem)]">
                            <div className="rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
                                <CatChip cat={selectedTopic.cat} small />
                                <h4 className="mb-1.5 mt-2 text-[15px] font-bold leading-snug text-foreground">
                                    {selectedTopic.title}
                                </h4>
                                <MetaRow topic={selectedTopic} />
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* trending topics */}
            <section className="border-y border-border bg-card px-4 py-8 sm:px-8 lg:px-14">
                <SectionHead
                    kicker="Για τον Κώστα · τάσεις"
                    title="Πιο πολυσυζητημένα τώρα"
                    sub="Τα θέματα που προκάλεσαν τη μεγαλύτερη συζήτηση στα πρόσφατα συμβούλια."
                    action="Όλα τα θέματα"
                />
                <div className="mb-5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                    <FilterBar value={cat} onChange={setCat} />
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {grid.map((t) => (
                        <EditorialCard key={t.id} topic={t} onClick={() => selectTopic(t.id)} />
                    ))}
                </div>
            </section>

            {/* meetings + municipalities */}
            <section className="grid gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:gap-11 lg:px-14">
                <div>
                    <SectionHead
                        kicker="Σχετικές · επόμενες"
                        title="Επόμενες συνεδριάσεις"
                        sub="Πότε συζητιούνται τα θέματα — με υπενθύμιση πριν ξεκινήσουν."
                    />
                    <div className="flex flex-col gap-3">
                        {MEETINGS.map((m, i) => (
                            <MeetingRow key={i} meeting={m} />
                        ))}
                    </div>
                </div>
                <div>
                    <SectionHead kicker="Πλοήγηση" title="Οι δήμοι μας" action="Όλοι" />
                    <div className="grid grid-cols-2 gap-3.5">
                        {MUNICIPALITIES.map((m) => (
                            <MuniCard key={m.slug} slug={m.slug} />
                        ))}
                    </div>
                </div>
            </section>

            {/* footer */}
            <footer className="flex flex-col items-start gap-3 bg-foreground px-4 py-6 text-sm text-background/70 sm:flex-row sm:items-center sm:px-8 lg:px-14">
                <BrandMark light />
                <span className="opacity-70">Φτιαγμένο με σεβασμό για την τοπική αυτοδιοίκηση.</span>
                <div className="sm:flex-1" />
                <div className="flex gap-4">
                    <span>Για δήμους</span>
                    <span>API</span>
                    <span>OpenCouncil AI</span>
                </div>
            </footer>
        </div>
    );
}

/* ---- section header ---- */
function SectionHead({
    kicker,
    title,
    sub,
    action,
}: {
    kicker: string;
    title: string;
    sub?: string;
    action?: string;
}) {
    return (
        <div className="mb-5 flex items-end justify-between gap-5">
            <div>
                <Eyebrow className="!text-primary">{kicker}</Eyebrow>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
                {sub && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{sub}</p>}
            </div>
            {action && (
                <Button variant="outline" className="hidden shrink-0 sm:inline-flex">
                    {action} <ArrowRight className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
}

/* ---- meeting row ---- */
function MeetingRow({ meeting }: { meeting: (typeof MEETINGS)[number] }) {
    const m = municipalityOf(meeting.muni);
    const up = meeting.status === 'upcoming';
    const [day, mon] = meeting.date.split(' ');
    return (
        <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
            <div
                className={cn(
                    'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl',
                    up ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
            >
                <span className="font-mono text-base font-bold leading-none">{day}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide">{mon}</span>
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{m.name}</span>
                    {up && (
                        <span className="text-[11px] font-extrabold uppercase tracking-wide text-[hsl(var(--orange))]">
                            σε {meeting.inDays} ημ.
                        </span>
                    )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {meeting.title}
                    <span aria-hidden className="opacity-40">·</span>
                    <Clock className="h-3 w-3" /> {meeting.time}
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="font-mono tabular-nums">{meeting.topics}</span> θέματα
                </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
    );
}

/* ---- municipality card ---- */
function MuniCard({ slug }: { slug: string }) {
    const m = municipalityOf(slug);
    return (
        <button
            type="button"
            className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-colors hover:border-foreground/20"
        >
            <div className="relative h-[74px] bg-muted">
                <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_10px,hsl(var(--background))_10px_20px)]" />
                <span className="absolute bottom-1.5 left-2 font-mono text-[10px] text-muted-foreground">
                    {m.name} — χάρτης δήμου
                </span>
            </div>
            <div className="px-3.5 pb-3.5 pt-3">
                <div className="-mt-7 mb-2 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-card bg-primary/10 text-sm font-bold text-primary shadow-sm">
                        {m.name[0]}
                    </span>
                    <span className="text-base font-bold text-foreground">{m.name}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                        <b className="font-mono tabular-nums text-foreground/80">{m.sessions}</b> συνεδρ.
                    </span>
                    <span>
                        <b className="font-mono tabular-nums text-foreground/80">{m.parties}</b> παρατάξεις
                    </span>
                    <span>
                        <b className="font-mono tabular-nums text-foreground/80">{m.people}</b> πρόσωπα
                    </span>
                </div>
            </div>
        </button>
    );
}
