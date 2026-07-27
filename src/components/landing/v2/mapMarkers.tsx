'use client';

import mapboxgl, { type Map as MapboxMap } from 'mapbox-gl';
import { createRoot, type Root } from 'react-dom/client';
import { useTranslations } from 'next-intl';
import { ArrowRight, Landmark, X } from 'lucide-react';
import Icon from '@/components/icon';

/** Translate function shape — passed into the plain-DOM marker factories, which run outside
 *  React and so can't call useTranslations themselves. */
type TFn = (key: string, values?: Record<string, string | number>) => string;
import type { LandingGeneralCity, LandingSubject, MunicipalitySubjectCount } from '@/lib/landing/landingData';
import { stylePin, type SubjectPin } from '@/lib/landing/landingCore';
import { SubjectCard } from './SubjectCard';
import { captureLandingAction } from '@/lib/landing/analytics';
import {
    MUNICIPALITY_DONUT_COUNT_Y,
    MUNICIPALITY_DONUT_DIAMETER,
    MUNICIPALITY_DONUT_INK_HEIGHT,
    MUNICIPALITY_DONUT_INK_TOP,
    MUNICIPALITY_DONUT_INK_WIDTH,
    MUNICIPALITY_DONUT_LOGO_SIZE,
    computeMunicipalityDonutSegments,
    municipalityDonutSvg,
} from '@/lib/landing/donut';
import { TopicIcon } from '@/components/TopicIcon';

/* Desktop floating tooltip above the selected subject's pin. Rendered into a Mapbox popup
   (createRoot), so navigation goes through onView/onClose callbacks, not router context. */
export function DesktopSubjectTooltip({
    subject,
    onView,
    onClose,
}: {
    subject: LandingSubject;
    onView: () => void;
    onClose: () => void;
}) {
    return (
        <div className="relative w-[300px] max-w-[80vw] font-relative">
            <SubjectCard subject={subject} variant="preview" onView={onView} onClose={onClose} className="shadow-xl" />
            {/* tail pointing down toward the pin */}
            <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-border bg-card" />
        </div>
    );
}

/* tooltip shown when the OpenCouncil map badge is clicked — same shape as the subject
   tooltip, with a link to /explain. Rendered into a Mapbox popup via createRoot. */
export function ExplainTooltip({ onView, onClose }: { onView: () => void; onClose: () => void }) {
    const t = useTranslations('landingV2');
    return (
        <div className="relative w-[280px] max-w-[80vw] font-relative">
            <div className="rounded-2xl border border-[hsl(var(--orange))]/40 bg-card shadow-xl">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close')}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                    <X className="h-4 w-4" />
                </button>
                <div className="flex w-full flex-col gap-2 p-3.5 pr-9">
                    <h3 className="text-[15px] font-bold leading-snug text-foreground">{t('explain.title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('explain.body')}</p>
                    <button
                        type="button"
                        onClick={onView}
                        className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[hsl(var(--orange))] underline"
                    >
                        {t('common.learnMore')} <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
            {/* tail pointing down toward the badge */}
            <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-[hsl(var(--orange))]/40 bg-card" />
        </div>
    );
}

/* tooltip for a clicked out-of-network municipality — says it's not on OpenCouncil yet
   and links to the petition. Rendered into a Mapbox popup via createRoot. */
export function MunicipalityTooltip({
    name,
    onView,
    onClose,
}: {
    name: string;
    onView: () => void;
    onClose: () => void;
}) {
    const t = useTranslations('landingV2');
    return (
        <div className="relative w-[280px] max-w-[80vw] font-relative">
            <div className="rounded-2xl border border-[hsl(var(--orange))]/40 bg-card shadow-xl">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close')}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                    <X className="h-4 w-4" />
                </button>
                <div className="flex w-full flex-col gap-2 p-3.5 pr-9">
                    <h3 className="text-[15px] font-bold leading-snug text-foreground">{name}</h3>
                    <p className="text-sm text-muted-foreground">{t('municipalityTooltip.body')}</p>
                    <button
                        type="button"
                        onClick={() => {
                            captureLandingAction('petition_started', { source: 'map', city_name: name });
                            onView();
                        }}
                        className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[hsl(var(--orange))] underline"
                    >
                        {t('common.requestToAdd')} <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
            {/* tail pointing down toward the municipality */}
            <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-[hsl(var(--orange))]/40 bg-card" />
        </div>
    );
}

/* Floating list opened by a city-hall marker — a municipality's non-located subjects.
   Items link straight to their subject pages. Positioned at the marker's screen point. */
export function GeneralSubjectsBox({
    data,
    onSelect,
    onClose,
}: {
    data: { city: LandingGeneralCity; x: number; y: number };
    onSelect: (id: string) => void;
    onClose: () => void;
}) {
    const t = useTranslations('landingV2');
    const below = data.y < 280; // not enough room above → drop below the marker
    const { city } = data;
    return (
        <>
            <div className="absolute inset-0 z-[14]" onClick={onClose} />
            <div
                className="absolute z-[15] w-72 max-w-[calc(100%-1.5rem)]"
                style={{
                    left: data.x,
                    top: data.y,
                    transform: `translate(-50%, ${below ? '16px' : 'calc(-100% - 16px)'})`,
                }}
            >
                <div className="rounded-xl border border-border bg-card p-1.5 shadow-xl">
                    <div className="flex items-start justify-between gap-2 px-2 py-1">
                        <span className="min-w-0">
                            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {t('general.title', { count: city.subjects.length })}
                            </span>
                            <span className="block truncate text-[13px] font-semibold text-foreground">
                                {city.nameMunicipality}
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('common.close')}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
                        {t('general.subtitle')}
                    </p>
                    <div className="max-h-64 overflow-y-auto">
                        {city.subjects.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => onSelect(s.id)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                            >
                                <TopicIcon
                                    color={s.topic.color}
                                    icon={s.topic.icon}
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                />
                                <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                                    {s.title}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

export function CoLocatedBox({
    data,
    onSelect,
    onClose,
}: {
    data: { subjects: LandingSubject[]; x: number; y: number };
    onSelect: (id: string) => void;
    onClose: () => void;
}) {
    const t = useTranslations('landingV2');
    const below = data.y < 240; // not enough room above → drop the box below the marker
    return (
        <>
            {/* transparent backdrop closes the box on an outside click */}
            <div className="absolute inset-0 z-[14]" onClick={onClose} />
            <div
                className="absolute z-[15] w-64 max-w-[calc(100%-1.5rem)] [--nudge:0px] lg:[--nudge:28px]"
                style={{
                    left: data.x,
                    top: data.y,
                    transform: `translate(calc(-50% + var(--nudge)), ${below ? '16px' : 'calc(-100% - 16px)'})`,
                }}
            >
                <div className="rounded-xl border border-border bg-card p-1.5 shadow-xl">
                    <div className="flex items-center justify-between gap-2 px-2 py-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('general.coLocated', { count: data.subjects.length })}
                        </span>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('common.close')}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {data.subjects.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => onSelect(s.id)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                            >
                                <TopicIcon
                                    color={s.topic.color}
                                    icon={s.topic.icon}
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                />
                                <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                                    {s.title}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

/* ---- HTML marker factories (added onto the Mapbox instance) --------------------------- */

/** One icon marker for a location group: a single subject selects on click; a co-located
 *  group shows a "+N" badge that opens its box. `selected` styles the highlighted pin. */
export function createSubjectPin(
    map: MapboxMap,
    group: LandingSubject[],
    opts: {
        selected: boolean;
        /** filled category style (mobile preview / mobile selection) */
        intense: boolean;
        /** dense viewport — draw a bare topic-coloured dot instead of an icon badge */
        dot: boolean;
        onSelect: (id: string) => void;
        onOpenCoLocated: (group: LandingSubject[]) => void;
        t: TFn;
    },
): SubjectPin {
    const { t } = opts;
    const rep = group[0];
    const coLocated = group.length > 1;
    const rootEl = document.createElement('div');
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', coLocated ? t('marker.samePoint', { count: group.length }) : rep.title);
    rootEl.appendChild(el);

    // The icon's own container: faded rather than unmounted on the dot↔badge morph, so with the
    // button's size transition the pin visibly grows out of (or melts into) its dot. Its React root
    // mounts lazily on the first badge appearance — a dot needs none, which is the point at
    // density: hundreds of roots is what made a crowded viewport expensive, not the markers.
    const iconEl = document.createElement('span');
    iconEl.className = 'flex items-center justify-center transition-opacity duration-200';
    el.appendChild(iconEl);

    // Co-located groups keep their "+N" badge through dot mode (hidden, scaled away) so the morph
    // is a style change, not a rebuild. Clicks behave the same in both shapes.
    let badge: HTMLButtonElement | null = null;
    if (coLocated) {
        badge = document.createElement('button');
        badge.type = 'button';
        badge.textContent = `+${group.length - 1}`;
        badge.setAttribute('aria-label', t('marker.seeSamePoint', { count: group.length }));
        badge.className =
            'absolute -right-2 -top-2 z-[1] flex h-4 min-w-4 cursor-pointer items-center justify-center rounded-full border border-white bg-[hsl(var(--orange))] px-1 text-[10px] font-bold leading-none text-white shadow transition-all duration-200';
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            opts.onOpenCoLocated(group);
        });
        rootEl.appendChild(badge);
    }

    const pin: SubjectPin = {
        el,
        rootEl,
        root: null,
        marker: null as unknown as mapboxgl.Marker,
        subject: coLocated ? null : rep,
        dot: opts.dot,
        setDot: () => {},
    };

    const applyMode = (dot: boolean, selected: boolean, intense: boolean) => {
        pin.dot = dot;
        stylePin({ el, rootEl }, rep, selected, intense, dot);
        if (coLocated) {
            // Above single pins in both shapes (stylePin writes a selection-based z-index).
            rootEl.style.zIndex = '4';
            if (!dot) {
                // Size a co-located pin like the city-hall markers (h-9) so the "+N" badge sits at
                // the same corner offset as their count badge, not overlapping a smaller circle.
                el.classList.remove('h-7', 'w-7');
                el.classList.add('h-9', 'w-9');
            }
            // No room for the badge on a dot — scaled away (and unclickable) instead of removed.
            badge?.classList.toggle('scale-0', dot);
            badge?.classList.toggle('opacity-0', dot);
            badge?.classList.toggle('pointer-events-none', dot);
        }
        if (dot) {
            iconEl.style.opacity = '0';
        } else {
            if (!pin.root) {
                pin.root = createRoot(iconEl);
                // currentColor so stylePin's `el.style.color` controls the icon (topic colour, or
                // white when intense)
                pin.root.render(<Icon name={rep.topic.icon || 'hash'} color="currentColor" size={rep.hot ? 18 : 14} />);
            }
            iconEl.style.opacity = '1';
        }
    };
    // The pin resolves its own highlight from the ids: a "+N" pin has `subject: null`, so a caller
    // reading `pin.subject` would restyle a selected group as unselected on every morph. Same
    // group-aware rule as buildSubjectPins' initial styling.
    pin.setDot = (dot, selectedId, previewId) => {
        if (dot === pin.dot) return;
        const selected = !!selectedId && group.some((s) => s.id === selectedId);
        const intense = selected || (!!previewId && group.some((s) => s.id === previewId));
        applyMode(dot, selected, intense);
    };
    applyMode(opts.dot, opts.selected, opts.intense);

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (coLocated) opts.onOpenCoLocated(group);
        else opts.onSelect(rep.id);
    });
    pin.marker = new mapboxgl.Marker({ element: rootEl }).setLngLat([rep.lng, rep.lat]).addTo(map);
    return pin;
}

/**
 * A single-δήμος donut for the zoomed-out view: the δήμος's topic mix as coloured arcs across the top
 * of the ring, its total subject count in the gap at the bottom of that ring, and the municipality
 * logo in the middle. A click zooms into the δήμος. Anchored at the δήμος centroid, shifted by
 * `offset` and shrunk by `scale` when it packs into a neighbour cluster (see
 * packMunicipalityMarkers). The boundaries are drawn by useMapFeatures; the ring geometry lives in
 * ./donut.ts.
 *
 * The positioning shell every packed (bubble-cluster) marker shares.
 *
 * HIT-AREA INVARIANT — anything Mapbox positions must have its hit area coincide with what's
 * drawn. The packing displacement therefore goes through `Marker.setOffset()`, which moves the
 * marker's element — box and paint together. It must NEVER be a CSS translate on an inner
 * wrapper: that moves only the paint, leaving an invisible click-swallowing box at the anchor
 * whose clicks fall through to the map (shipped once, broke donut clicking in production).
 *
 * The packing is intentionally discrete (a satellite is either home or on the cluster ring), so
 * placement changes animate: `setPlacement` sets a target and a self-terminating rAF loop eases
 * the real offset toward it — smooth motion with the hit area correct on every frame. This also
 * decouples repacking from rendering: targets may arrive at any rate (see attachLiveRepack) while
 * the easing runs at frame rate. Scale stays a CSS transform on an inner wrapper, which is safe
 * because it is always ≤ 1: the paint only ever shrinks inside the box.
 */
function packedMarkerShell(offset: [number, number], scale: number) {
    const rootEl = document.createElement('div');
    rootEl.style.zIndex = '2';
    // The wrappers are pointer-transparent; the factory re-enables pointer events on the drawn
    // button. A scaled-down marker's wrappers keep their UNSCALED layout boxes, and a plain div
    // hit-tests — so without this, the margin around a shrunken satellite silently swallows
    // clicks that should reach the map. Same invariant as the offset rule: only painted pixels
    // may capture clicks. Via the !important class in globals.css, because mapbox-gl re-sets
    // inline pointer-events on marker elements during its own occlusion updates.
    rootEl.className = 'oc-packed-marker';
    const scaleEl = document.createElement('div');
    scaleEl.style.pointerEvents = 'none';
    scaleEl.style.transform = `scale(${scale})`;
    scaleEl.style.transition = 'transform 200ms ease';
    rootEl.appendChild(scaleEl);

    let marker: mapboxgl.Marker | null = null;
    const current = { x: offset[0], y: offset[1] };
    const target = { x: offset[0], y: offset[1], s: scale };
    let frame = 0;
    const step = () => {
        frame = 0;
        // Exponential approach — ~90% of the way in ~7 frames (≈120ms at 60Hz), then snap.
        current.x += (target.x - current.x) * 0.3;
        current.y += (target.y - current.y) * 0.3;
        const settled = Math.abs(target.x - current.x) < 0.5 && Math.abs(target.y - current.y) < 0.5;
        if (settled) {
            current.x = target.x;
            current.y = target.y;
        }
        marker?.setOffset([current.x, current.y]);
        if (!settled) frame = requestAnimationFrame(step);
    };

    return {
        rootEl,
        scaleEl,
        /** the shell drives this Marker's offset — create it with the same initial `offset` */
        attach: (m: mapboxgl.Marker) => {
            marker = m;
        },
        setPlacement: ([x, y]: [number, number], s: number) => {
            target.x = x;
            target.y = y;
            if (s !== target.s) {
                target.s = s;
                scaleEl.style.transform = `scale(${s})`;
            }
            if (!frame) frame = requestAnimationFrame(step);
        },
        /** cancel any in-flight easing — call before Marker.remove() */
        dispose: () => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
        },
    };
}

/** A packed marker's handle: the Marker, the shell's animated `setPlacement`, and `dispose` to
 *  cancel in-flight easing before removal. */
export type PackedMarker = {
    marker: mapboxgl.Marker;
    setPlacement: (offset: [number, number], scale: number) => void;
    dispose: () => void;
};

// The donut's ink bounding box (see donut.ts): the clickable element is exactly this box — not
// the 68×68 SVG canvas, whose margins would overlap neighbouring tangent donuts' boxes by ~15px
// and mis-route their clicks.
const DONUT_INK_TOP = MUNICIPALITY_DONUT_INK_TOP;
export const DONUT_INK_WIDTH = MUNICIPALITY_DONUT_INK_WIDTH;
export const DONUT_INK_HEIGHT = MUNICIPALITY_DONUT_INK_HEIGHT;

/**
 * Returns the Marker plus the shell's animated `setPlacement` (see packedMarkerShell). The
 * element is the donut's ink box, centred on the anchor — so the packing extent for this marker
 * is {rx: DONUT_INK_WIDTH/2, ry: DONUT_INK_HEIGHT/2, cy: 0}.
 */
export function createMunicipalityCountMarker(
    map: MapboxMap,
    muni: MunicipalitySubjectCount,
    onZoom: (muni: MunicipalitySubjectCount) => void,
    t: TFn,
    /** pixel nudge keeping this donut clear of its neighbours' (see packMunicipalityMarkers) */
    offset: [number, number] = [0, 0],
    /** initial size class — 1 full, <1 for a cluster satellite */
    scale = 1,
): PackedMarker {
    const shell = packedMarkerShell(offset, scale);
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', t('marker.municipalityZoom', { name: muni.nameMunicipality, count: muni.count }));
    el.className =
        'relative block cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform hover:scale-110';
    el.style.pointerEvents = 'auto'; // the drawn box is the click target (wrappers are transparent)
    el.style.width = `${DONUT_INK_WIDTH}px`;
    el.style.height = `${DONUT_INK_HEIGHT}px`;

    // Topic ring. Same segment model as the subject donuts, so a δήμος and a cluster inside it read
    // as the same kind of thing. The SVG keeps its own 68×68 canvas, shifted so its ink lands in
    // this element's box.
    const ring = document.createElement('div');
    ring.className = 'pointer-events-none absolute';
    ring.style.left = `${-(MUNICIPALITY_DONUT_DIAMETER - DONUT_INK_WIDTH) / 2}px`;
    ring.style.top = `${-DONUT_INK_TOP}px`;
    ring.innerHTML = municipalityDonutSvg(computeMunicipalityDonutSegments(muni.members));
    el.appendChild(ring);

    // δήμος logo (or its initial when there's none), at the centre of the arc. The white ring is its
    // own — the arc is a hairline out at the rim, so there's no disc behind the logo to back it.
    const logo = document.createElement('span');
    logo.className =
        'absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-white';
    logo.style.top = `${MUNICIPALITY_DONUT_DIAMETER / 2 - DONUT_INK_TOP}px`;
    logo.style.width = `${MUNICIPALITY_DONUT_LOGO_SIZE}px`;
    logo.style.height = `${MUNICIPALITY_DONUT_LOGO_SIZE}px`;
    logo.style.boxShadow = '0 0 0 1px #fff, 0 1px 3px rgba(0,0,0,0.25)';
    if (muni.logoImage) {
        const img = document.createElement('img');
        img.src = muni.logoImage;
        img.alt = '';
        img.className = 'h-full w-full object-contain';
        logo.appendChild(img);
    } else {
        logo.textContent = muni.cityName.slice(0, 1);
        logo.classList.add('text-base', 'font-bold', 'text-foreground');
    }
    el.appendChild(logo);

    // The total, on the ring's white bottom band. Painted last so it stays legible where it laps over
    // the logo — the band is thinner than the number is tall. A white halo carries it across the
    // seam between band and logo.
    const count = document.createElement('span');
    count.textContent = String(muni.count);
    count.className = 'absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-[15px] font-bold leading-none';
    count.style.top = `${MUNICIPALITY_DONUT_COUNT_Y - DONUT_INK_TOP}px`;
    count.style.color = '#0c0a09';
    count.style.textShadow = '0 0 3px #fff, 0 0 3px #fff, 0 1px 2px #fff, 0 -1px 2px #fff';
    el.appendChild(count);

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        captureLandingAction('municipality_count_opened', { city_id: muni.cityId, count: muni.count });
        onZoom(muni);
    });
    shell.scaleEl.appendChild(el);
    const marker = new mapboxgl.Marker({ element: shell.rootEl, offset }).setLngLat([muni.lng, muni.lat]).addTo(map);
    shell.attach(marker);
    return { marker, setPlacement: shell.setPlacement, dispose: shell.dispose };
}

/**
 * Build all subject pins for the current viewport: one pin per location group, with co-located
 * subjects sharing a "+N" marker. The selected subject is pulled out and drawn last so its
 * highlighted pin sits above its neighbours.
 *
 * `dot` collapses every pin to a plain topic-coloured dot — the whole layer at once, so the map
 * doesn't read as two kinds of thing at the same zoom. The caller decides, since only it knows how
 * many subjects are actually in the viewport (this function is handed the filter-scoped set, which
 * includes off-screen ones and doesn't change as you zoom).
 */
export function buildSubjectPins(
    map: MapboxMap,
    locationGroups: LandingSubject[][],
    opts: {
        selectedId: string | null;
        /** mobile only: the previewed subject, drawn with the intense selection style */
        previewId: string | null;
        /** dense viewport — draw every pin as a bare topic-coloured dot */
        dot: boolean;
        onSelect: (id: string) => void;
        onOpenCoLocated: (group: LandingSubject[]) => void;
        t: TFn;
    },
): SubjectPin[] {
    const selId = opts.selectedId;
    const dot = opts.dot;
    let selectedGroup: LandingSubject[] | null = null;
    const rest: LandingSubject[][] = [];
    for (const group of locationGroups) {
        if (selId && !selectedGroup && group.some((s) => s.id === selId)) selectedGroup = group;
        else rest.push(group);
    }
    const makePin = (group: LandingSubject[]) => {
        const selected = !!selId && group.some((s) => s.id === selId);
        // A selected subject (desktop or mobile) and the mobile preview both get the intense filled
        // style — category-colour fill + category border, consistent across viewports.
        const intense = selected || (!!opts.previewId && group.some((s) => s.id === opts.previewId));
        return createSubjectPin(map, group, {
            selected,
            intense,
            dot,
            onSelect: opts.onSelect,
            onOpenCoLocated: opts.onOpenCoLocated,
            t: opts.t,
        });
    };

    const pins: SubjectPin[] = rest.map(makePin);
    if (selectedGroup) pins.push(makePin(selectedGroup));
    return pins;
}

/** A city-hall marker for a municipality's non-located subjects: the δήμος logo (or a slate
 *  Landmark when there's no logo) with a count badge. Clicking it runs `onClick`. */
export function createGeneralCityMarker(
    map: MapboxMap,
    city: LandingGeneralCity,
    onClick: () => void,
    t: TFn,
): { marker: mapboxgl.Marker; root: ReturnType<typeof createRoot> } {
    const logo = city.subjects[0]?.cityLogo ?? null;
    const rootEl = document.createElement('div');
    rootEl.style.zIndex = '1';
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', t('general.cityAria', { name: city.nameMunicipality, count: city.subjects.length }));
    el.className = `flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-white shadow-md transition-transform hover:scale-110 ${logo ? 'bg-white' : 'bg-[#5b6b8c] text-white'}`;
    rootEl.appendChild(el);
    const root = createRoot(el);
    root.render(
        logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
            <Landmark size={16} />
        ),
    );

    const badge = document.createElement('span');
    badge.textContent = String(city.subjects.length);
    badge.className =
        'pointer-events-none absolute -right-2 -top-2 z-[1] flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[#5b6b8c] px-1 text-[10px] font-bold leading-none text-white shadow';
    rootEl.appendChild(badge);

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    const marker = new mapboxgl.Marker({ element: rootEl }).setLngLat([city.lng, city.lat]).addTo(map);
    return { marker, root };
}

