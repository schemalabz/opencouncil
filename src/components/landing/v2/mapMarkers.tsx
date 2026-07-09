'use client';

import mapboxgl, { type Map as MapboxMap } from 'mapbox-gl';
import { createRoot } from 'react-dom/client';
import { useTranslations } from 'next-intl';
import { ArrowRight, Landmark, X } from 'lucide-react';
import Icon from '@/components/icon';

/** Translate function shape — passed into the plain-DOM marker factories, which run outside
 *  React and so can't call useTranslations themselves. */
type TFn = (key: string, values?: Record<string, string | number>) => string;
import type { LandingGeneralCity, LandingMapCity, LandingSubject } from '@/lib/landing/landingData';
import { CLUSTER_THRESHOLD, clusterCellDegrees, stylePin, type SubjectPin } from '@/lib/landing/landingCore';
import { SubjectCard } from './SubjectCard';
import { captureLandingAction } from '@/lib/landing/analytics';
import { computeDonutSegments, donutDiameter, donutSegmentIcons, donutSvg } from '@/lib/landing/donut';

/**
 * Donut cluster marker — a topic-segmented ring with the total count on a centre disc and
 * each topic's icon on its segment. Geometry/SVG live in ./donut.ts.
 */
export function DonutCluster({ members }: { members: LandingSubject[] }) {
    const segments = computeDonutSegments(members);
    const total = members.length;
    const diameter = donutDiameter(total);
    const placements = donutSegmentIcons(segments, total);
    return (
        <div style={{ position: 'relative', width: diameter, height: diameter, lineHeight: 0 }}>
            <div
                style={{ width: diameter, height: diameter, borderRadius: '50%', boxShadow: '0 1px 3px rgb(0 0 0 / 0.25)' }}
                dangerouslySetInnerHTML={{ __html: donutSvg(segments, total) }}
            />
            {placements.map((p, i) => (
                <span
                    key={i}
                    style={{
                        position: 'absolute',
                        left: p.x,
                        top: p.y,
                        width: p.size,
                        height: p.size,
                        transform: 'translate(-50%,-50%)',
                        lineHeight: 0,
                        pointerEvents: 'none',
                    }}
                >
                    <Icon name={p.icon || 'hash'} color="#ffffff" size={p.size} />
                </span>
            ))}
        </div>
    );
}

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
                                <span
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                                    style={{ backgroundColor: `${s.topic.color}1a` }}
                                >
                                    <Icon name={s.topic.icon || 'hash'} color={s.topic.color} size={13} />
                                </span>
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
                                <span
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                                    style={{ backgroundColor: `${s.topic.color}1a` }}
                                >
                                    <Icon name={s.topic.icon || 'hash'} color={s.topic.color} size={13} />
                                </span>
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
        onSelect: (id: string) => void;
        onOpenCoLocated: (group: LandingSubject[]) => void;
        t: TFn;
    },
): SubjectPin {
    const { t } = opts;
    const rep = group[0];
    const rootEl = document.createElement('div');
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', group.length > 1 ? t('marker.samePoint', { count: group.length }) : rep.title);
    rootEl.appendChild(el);
    stylePin({ el, rootEl }, rep, opts.selected);
    const root = createRoot(el);
    root.render(<Icon name={rep.topic.icon || 'hash'} color={rep.topic.color} size={rep.hot ? 18 : 14} />);

    if (group.length > 1) {
        // Size a co-located pin like the city-hall markers (h-9) so the "+N" badge sits at
        // the same corner offset as their count badge, not overlapping a smaller (h-7) circle.
        el.classList.remove('h-7', 'w-7');
        el.classList.add('h-9', 'w-9');
        rootEl.style.zIndex = '4';
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            opts.onOpenCoLocated(group);
        });
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.textContent = `+${group.length - 1}`;
        badge.setAttribute('aria-label', t('marker.seeSamePoint', { count: group.length }));
        badge.className =
            'absolute -right-2 -top-2 z-[1] flex h-4 min-w-4 cursor-pointer items-center justify-center rounded-full border border-white bg-[hsl(var(--orange))] px-1 text-[10px] font-bold leading-none text-white shadow';
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            opts.onOpenCoLocated(group);
        });
        rootEl.appendChild(badge);
    } else {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            opts.onSelect(rep.id);
        });
    }
    const marker = new mapboxgl.Marker({ element: rootEl }).setLngLat([rep.lng, rep.lat]).addTo(map);
    return { el, rootEl, root, marker, subject: group.length > 1 ? null : rep };
}

/** A donut cluster marker (a proximity cell with members from >1 location) — click zooms in. */
export function createDonutMarker(map: MapboxMap, members: LandingSubject[], t: TFn): SubjectPin {
    const rootEl = document.createElement('div');
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', t('marker.clusterZoom', { count: members.length }));
    el.className = 'grid cursor-pointer place-items-center border-0 bg-transparent p-0 transition-transform hover:scale-105';
    rootEl.style.zIndex = '3';
    rootEl.appendChild(el);
    const root = createRoot(el);
    root.render(<DonutCluster members={members} />);
    const centerLng = members.reduce((sum, m) => sum + m.lng, 0) / members.length;
    const centerLat = members.reduce((sum, m) => sum + m.lat, 0) / members.length;
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        // always zoom in toward the cluster (fitBounds couldn't zoom in on narrow viewports)
        map.easeTo({ center: [centerLng, centerLat], zoom: Math.min(map.getZoom() + 2, 18), duration: 400 });
    });
    const marker = new mapboxgl.Marker({ element: rootEl }).setLngLat([centerLng, centerLat]).addTo(map);
    return { el, rootEl, root, marker, subject: null };
}

/**
 * Build all subject pins for the current viewport. Buckets location groups into geographic
 * cells; a cell over CLUSTER_THRESHOLD collapses into a donut, else individual pins / "+N"
 * markers. The selected group is pulled out of clustering and always drawn as its own
 * highlighted pin, so a selection stays visible even when zoomed out.
 */
export function buildSubjectPins(
    map: MapboxMap,
    locationGroups: LandingSubject[][],
    opts: {
        selectedId: string | null;
        onSelect: (id: string) => void;
        onOpenCoLocated: (group: LandingSubject[]) => void;
        t: TFn;
    },
): SubjectPin[] {
    const cell = clusterCellDegrees(map.getZoom());
    const selId = opts.selectedId;
    let selectedGroup: LandingSubject[] | null = null;
    // plain object, not Map() — the imported <Map> component shadows the global
    const cells: Record<string, LandingSubject[][]> = {};
    for (const group of locationGroups) {
        if (selId && !selectedGroup && group.some((s) => s.id === selId)) {
            selectedGroup = group;
            continue;
        }
        const rep = group[0];
        const key = `${Math.floor(rep.lng / cell)}:${Math.floor(rep.lat / cell)}`;
        (cells[key] ??= []).push(group);
    }
    const makePin = (group: LandingSubject[]) =>
        createSubjectPin(map, group, {
            selected: !!selId && group.some((s) => s.id === selId),
            onSelect: opts.onSelect,
            onOpenCoLocated: opts.onOpenCoLocated,
            t: opts.t,
        });

    const pins: SubjectPin[] = [];
    for (const cellGroups of Object.values(cells)) {
        const subjectCount = cellGroups.reduce((sum, g) => sum + g.length, 0);
        if (subjectCount > CLUSTER_THRESHOLD) {
            pins.push(createDonutMarker(map, cellGroups.flat(), opts.t));
        } else {
            for (const group of cellGroups) pins.push(makePin(group));
        }
    }
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

/** A logo marker for a cooperating δήμος in the "municipalities" view; click runs `onClick`. */
export function createMunicipalityMarker(map: MapboxMap, city: LandingMapCity, onClick: () => void): mapboxgl.Marker {
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', city.nameMunicipality);
    el.className =
        'flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white shadow-md transition-transform hover:scale-110';
    if (city.logoImage) {
        const img = document.createElement('img');
        img.src = city.logoImage;
        img.alt = '';
        img.className = 'h-full w-full object-contain';
        el.appendChild(img);
    } else {
        el.textContent = city.name.slice(0, 1);
        el.classList.add('text-sm', 'font-bold', 'text-foreground');
    }
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    return new mapboxgl.Marker({ element: el }).setLngLat([city.lng, city.lat]).addTo(map);
}
