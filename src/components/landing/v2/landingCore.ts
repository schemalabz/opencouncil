import type { Root } from 'react-dom/client';
import type mapboxgl from 'mapbox-gl';
import type { Topic } from '@prisma/client';
import { cn } from '@/lib/utils';
import { calculateGeometryBounds } from '@/lib/geo';
import type {
    LandingCity,
    LandingSubject,
    LandingGeneralCity,
    MunicipalityInterest,
    QueryKind,
    UpcomingMeeting,
} from './landingData';
import type { ReactNode } from 'react';

// Default view framing the whole of Greece (Mapbox expects [lng, lat]). Used when there
// is no municipality filter and no selected subject to fly to; a filter/selection
// overrides it via easeTo/fitBounds.
export const DEFAULT_VIEW: { center: [number, number]; zoom: number } = {
    center: [22, 38.6],
    zoom: 6,
};

// OpenCouncil location ([lng, lat]) shown by the info card and a logo badge on the map
// (Κων/νου Σμολένσκη 22, Αθήνα 114 72).
export const EXPLAIN_LNGLAT: [number, number] = [23.740061, 37.986179];

// Selecting a subject centers it and nudges the zoom up to this level ONLY when the map
// is more zoomed-out than this (never zooms out, and won't zoom in further when already
// closer). Kept modest so clicking a subject doesn't jump deep into the map.
export const SUBJECT_FOCUS_ZOOM = 14;

// The search fields stand out with an orange border over a white background.
export const SEARCH_FIELD_STYLE = {
    borderColor: 'hsl(var(--orange))',
    backgroundColor: '#ffffff',
};

// A point (geolocation / selected subject) or a polygon (a filtered municipality's bounds).
export type FlyTarget = GeoJSON.Geometry | null;

/** Date-range options for subject filtering — days first, months for the long view. */
export const DATE_RANGES = [
    { key: '7d', label: '7 ημέρες', menuLabel: 'Τελευταίες 7 ημέρες', query: 'daysBack=7' },
    { key: '14d', label: '14 ημέρες', menuLabel: 'Τελευταίες 14 ημέρες', query: 'daysBack=14' },
    { key: '30d', label: '30 ημέρες', menuLabel: 'Τελευταίες 30 ημέρες', query: 'daysBack=30' },
    { key: '3m', label: '3 μήνες', menuLabel: 'Τελευταίοι 3 μήνες', query: 'monthsBack=3' },
    { key: '6m', label: '6 μήνες', menuLabel: 'Τελευταίοι 6 μήνες', query: 'monthsBack=6' },
    { key: '12m', label: '12 μήνες', menuLabel: 'Τελευταίοι 12 μήνες', query: 'monthsBack=12' },
    { key: 'all', label: 'Όλο το διάστημα', menuLabel: 'Όλο το διάστημα', query: 'allTime=true' },
] as const;
export type DateRangeKey = (typeof DATE_RANGES)[number]['key'];
export const DEFAULT_RANGE: DateRangeKey = '7d';

/** Widen the quick date range by two steps (7d → 30d, 14d → 3m, …), clamped at the widest. */
export function widenRange(current: DateRangeKey): DateRangeKey {
    const i = DATE_RANGES.findIndex((r) => r.key === current);
    const next = Math.min((i < 0 ? 0 : i) + 2, DATE_RANGES.length - 1);
    return DATE_RANGES[next].key;
}
/** Whether there's a wider range to widen into (false once at "Όλο το διάστημα"). */
export function canWidenRange(current: DateRangeKey): boolean {
    const i = DATE_RANGES.findIndex((r) => r.key === current);
    return i >= 0 && i < DATE_RANGES.length - 1;
}

/**
 * Search-dropdown filters that narrow the subjects shown. cityIds / bodyTypes / dates are
 * server-applied (sent to /api/map/subjects); minDuration is client-applied — discussion
 * time is computed per subject after the query, so it filters the already-fetched list.
 */
export type MapFilters = {
    cityIds: string[];
    bodyTypes: string[];
    dateFrom: string | null;
    dateTo: string | null;
    /** minimum discussion minutes (client-side); null = any */
    minDuration: number | null;
};
export const EMPTY_FILTERS: MapFilters = { cityIds: [], bodyTypes: [], dateFrom: null, dateTo: null, minDuration: null };

/** Administrative body types (matches the AdministrativeBodyType enum). */
export const BODY_TYPES = [
    { key: 'council', label: 'Συμβούλιο' },
    { key: 'committee', label: 'Επιτροπή' },
    { key: 'community', label: 'Κοινότητα' },
] as const;

/** Quick "minimum discussion time" presets for the search-dropdown filter. */
export const DURATION_FILTERS: { key: string; label: string; minMinutes: number | null }[] = [
    { key: 'any', label: 'Όλα', minMinutes: null },
    { key: 'discussed', label: 'Με συζήτηση', minMinutes: 1 },
    { key: '5', label: '5′+', minMinutes: 5 },
    { key: '15', label: '15′+', minMinutes: 15 },
    { key: '30', label: '30′+', minMinutes: 30 },
];

export function toggleValue(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
export function hasActiveFilters(f: MapFilters): boolean {
    return f.cityIds.length > 0 || f.bodyTypes.length > 0 || !!f.dateFrom || !!f.dateTo || f.minDuration != null;
}

/**
 * The map center's "which municipality am I over?" lookup (/api/cities/at, drives the
 * "view its page" button) only re-fires when the center moves more than this fraction of
 * the current viewport since the last query. A pure zoom-in/out keeps the center fixed, so
 * it never re-queries; a tiny pan is skipped too. The threshold scales with the viewport,
 * so it behaves the same at every zoom level.
 */
export const CENTER_QUERY_MOVE_RATIO = 0.2;

/** Subjects in view above which nearby ones merge into donut clusters. */
export const CLUSTER_THRESHOLD = 25;
/** When the list/map has no subjects in view, fall back to the N closest. */
export const NEAREST_FALLBACK = 10;
/**
 * Subjects more than this far apart never merge into the same donut, so distant
 * regions stay separate (e.g. an Attica donut is never merged with a Crete one).
 * ~111 km per degree of latitude → 100 km ≈ 0.9°.
 */
export const MAX_MERGE_KM = 100;
export const MAX_CLUSTER_CELL_DEG = MAX_MERGE_KM / 111;

/**
 * Geographic cluster cell size (degrees) for the current zoom. Tied to the integer
 * zoom level so clusters stay stable while panning or zooming within a level —
 * donut composition only changes when you cross a whole zoom step. The cell is
 * deliberately coarse (~half a tile) so dense areas collapse into a few big donuts,
 * but it's capped at MAX_CLUSTER_CELL_DEG so zooming out never merges far-apart
 * regions into one donut.
 */
export function clusterCellDegrees(zoom: number): number {
    return Math.min(360 / Math.pow(2, Math.floor(zoom) + 1), MAX_CLUSTER_CELL_DEG);
}

/**
 * An HTML map marker handle: either a subject's icon badge (`subject` set, React
 * root for the icon) or a cluster count circle (`subject` null, plain text).
 */
export type SubjectPin = {
    el: HTMLButtonElement;
    rootEl: HTMLDivElement;
    root: Root | null;
    marker: mapboxgl.Marker;
    subject: LandingSubject | null;
};

/**
 * Styles a map pin like the TopicChip badge, minus the label. Mapbox positions the
 * marker root via inline transform, so the scale/border styling goes on the inner
 * button and only z-index touches the root.
 */
export function stylePin({ el, rootEl }: { el: HTMLButtonElement; rootEl: HTMLDivElement }, subject: LandingSubject, selected: boolean) {
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

/**
 * Center the map on a municipality's geometry, offset so it lands at ~2/3 of the width
 * (right of the desktop floating list) rather than dead-center — the same right-shift the
 * subject/general-box pans use. Fits the whole δήμος when it has bounds; falls back to an
 * easeTo for a bare Point.
 */
export function flyToMunicipality(map: mapboxgl.Map, geometry: GeoJSON.Geometry, isMobile: boolean) {
    const { bounds } = calculateGeometryBounds(geometry);
    // desktop: shift the target right of center to clear the left-hand floating list, but
    // only a bit — closer to centre than a subject focus (which uses 210)
    const offset: [number, number] = isMobile ? [0, 0] : [120, 0];
    if (bounds) {
        map.fitBounds(
            [
                [bounds.minLng, bounds.minLat],
                [bounds.maxLng, bounds.maxLat],
            ],
            { padding: isMobile ? 120 : 80, maxZoom: 17, offset },
        );
    } else if (geometry.type === 'Point') {
        map.easeTo({ center: geometry.coordinates as [number, number], zoom: 16, offset });
    }
}

/** Desktop view mode — drives the aside panel content and the map's marker layer.
 *  'home' shows an intro panel over the subjects map; 'subjects' the subjects list +
 *  subject pins; 'municipalities' the δήμοι list + municipality logo markers. */
export type LandingView = 'home' | 'subjects' | 'municipalities';

/**
 * Map the shared view onto the desktop's tab set. Desktop has no 'home' tab — its map-first
 * view is the 'subjects' split (map + subjects panel) — so a 'home' (mobile map / shared URL)
 * collapses to 'subjects'. 'subjects' and 'municipalities' pass through 1:1.
 */
export function desktopView(view: LandingView): LandingView {
    return view === 'home' ? 'subjects' : view;
}

/** The selection + filters restored from the URL on first mount. */
export type InitialUrlState = {
    selectedId: string | null;
    view: LandingView;
    cats: string[];
    query: string;
    range: DateRangeKey;
    filters: MapFilters;
};

/**
 * Resolve the initial landing state from the URL query string (client-only, run once on
 * mount). Applies the deep-link rules: a `?subject=` forces the 'subjects' view and widens
 * the range to all-time (the subject may sit outside the default window) unless the URL
 * pins an explicit range; with no view/subject, mobile opens on 'home' and desktop on
 * 'subjects'. Absent params fall back to the defaults (empty cats/query, DEFAULT_RANGE, …).
 */
export function parseInitialUrlState(search: string, isMobile: boolean): InitialUrlState {
    const p = new URLSearchParams(search);
    const subject = p.get('subject');

    const viewParam = p.get('view');
    let view: LandingView;
    if (subject) view = 'subjects';
    else if (viewParam === 'home' || viewParam === 'subjects' || viewParam === 'municipalities') view = viewParam;
    else if (isMobile) view = 'home';
    else view = 'subjects';

    const catParam = p.get('cat');
    const cats = catParam ? catParam.split(',').filter(Boolean) : [];
    const query = p.get('q') ?? '';

    const r = p.get('range');
    let range: DateRangeKey;
    if (r && DATE_RANGES.some((d) => d.key === r)) range = r as DateRangeKey;
    else if (subject) range = 'all';
    else range = DEFAULT_RANGE;

    const city = p.get('city');
    const body = p.get('body');
    const from = p.get('from');
    const to = p.get('to');
    const dur = p.get('dur');
    const filters: MapFilters =
        city || body || from || to || dur
            ? {
                  cityIds: city ? [city] : [],
                  bodyTypes: body ? body.split(',').filter(Boolean) : [],
                  dateFrom: from || null,
                  dateTo: to || null,
                  minDuration: dur ? Number(dur) : null,
              }
            : EMPTY_FILTERS;

    return { selectedId: subject, view, cats, query, range, filters };
}

/** Props shared by the desktop and mobile layouts. */
export type LayoutProps = {
    /** desktop view mode (drives the aside nav/body and the map's marker layer) */
    view: LandingView;
    setView: (v: LandingView) => void;
    /** selected category (topic) ids — empty means "all" */
    cats: string[];
    /** toggle a category in/out of the selection (also clears any selected subject) */
    onToggleCat: (id: string) => void;
    /** clear the category selection */
    onClearCats: () => void;
    range: DateRangeKey;
    setRange: (v: DateRangeKey) => void;
    filters: MapFilters;
    setFilters: (v: MapFilters) => void;
    query: string;
    setQuery: (v: string) => void;
    queryKind: QueryKind;
    topics: Topic[];
    cities: LandingCity[];
    /** unfiltered total subjects per cityId (for the Δήμοι tab stats) */
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
    loading: boolean;
    selectedId: string | null;
    selectSubject: (id: string) => void;
    clearSelection: () => void;
    selectedSubject: LandingSubject | null;
    /** in-view subjects for the desktop panel (sorted), with nearest-N fallback */
    ordered: LandingSubject[];
    /** in-view subjects for the mobile sheet */
    trending: LandingSubject[];
    count: number;
    /** free-text search matches (title/address), shown in the search panel while typing */
    searchResults: LandingSubject[];
    /** open co-located-subjects box (subjects at one point + screen position), or null */
    coLocated: { subjects: LandingSubject[]; x: number; y: number } | null;
    onCoLocatedSelect: (id: string) => void;
    onCoLocatedClose: () => void;
    /** open "general subjects" box (a municipality's non-located subjects + screen position) */
    generalBox: { city: LandingGeneralCity; x: number; y: number } | null;
    /** select a non-located subject from the box → bring it into the Θέματα list like the rest */
    onGeneralSelect: (id: string) => void;
    onGeneralBoxClose: () => void;
    /** true when the satellite basemap is active */
    satellite: boolean;
    toggleMapStyle: () => void;
    locate: () => void;
    /** geocode a typed address query and fly the map to it */
    onLocateAddress: (q: string) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    /** Mobile: the OpenCouncil badge's card preview is open. */
    explainOpen: boolean;
    onCloseExplain: () => void;
    /** The municipality shown on the map (clicked or filter-selected) — for its page link.
     *  nameMunicipality is the genitive form (e.g. "Δήμος Χανίων"). */
    displayedMunicipality: { id: string; name: string; nameMunicipality: string } | null;
    mapNode: ReactNode;
};
