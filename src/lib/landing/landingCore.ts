import type { Root } from 'react-dom/client';
import type mapboxgl from 'mapbox-gl';
import type { Topic } from '@prisma/client';
import { cn } from '@/lib/utils';
import { calculateGeometryBounds } from '@/lib/geo';
import { topicStyle } from '@/lib/topicStyle';
import type {
    LandingListCity,
    LandingSubject,
    LandingGeneralCity,
    QueryKind,
    UpcomingMeeting,
} from './landingData';
import type { ReactNode } from 'react';

// OpenCouncil location ([lng, lat]) — Κων/νου Σμολένσκη 22, Αθήνα 114 72.
export const EXPLAIN_LNGLAT: [number, number] = [23.740061, 37.986179];

// Selecting a subject nudges zoom up to this level, but only when more zoomed-out than it.
export const SUBJECT_FOCUS_ZOOM = 14;

// The "view this δήμος's page" button only makes sense once a single municipality actually fills
// the view.
export const MUNICIPALITY_PAGE_BUTTON_MIN_ZOOM = 12;

// At or below this zoom the map shows the per-δήμος count numbers; above it, subject pins take over.
export const MUNICIPALITY_COUNT_MAX_ZOOM = 9;

export const SEARCH_FIELD_STYLE = {
    borderColor: 'hsl(var(--orange))',
    backgroundColor: '#ffffff',
};

// A point (geolocation / selected subject) or a polygon (a filtered municipality's bounds).
export type FlyTarget = GeoJSON.Geometry | null;

/** Date-range options for subject filtering — days first, months for the long view. */
export const DATE_RANGES = [
    { key: '14d', label: '14 ημέρες', menuLabel: 'Τελευταίες 14 ημέρες', query: 'daysBack=14' },
    { key: '30d', label: '30 ημέρες', menuLabel: 'Τελευταίες 30 ημέρες', query: 'daysBack=30' },
    { key: '3m', label: '3 μήνες', menuLabel: 'Τελευταίοι 3 μήνες', query: 'monthsBack=3' },
    { key: '6m', label: '6 μήνες', menuLabel: 'Τελευταίοι 6 μήνες', query: 'monthsBack=6' },
    { key: '12m', label: '12 μήνες', menuLabel: 'Τελευταίοι 12 μήνες', query: 'monthsBack=12' },
    { key: 'all', label: 'Όλο το διάστημα', menuLabel: 'Όλο το διάστημα', query: 'allTime=true' },
] as const;
export type DateRangeKey = (typeof DATE_RANGES)[number]['key'];
export const DEFAULT_RANGE: DateRangeKey = '3m';

/**
 * A range key as the fields the subject finders take (monthsBack / daysBack / allTime), so the
 * server initial load requests the same window the client would. Mirrors each DATE_RANGES `query`.
 */
export function rangeToSubjectFilters(range: DateRangeKey): { monthsBack?: number; daysBack?: number; allTime?: boolean } {
    const { query } = DATE_RANGES.find((r) => r.key === range) ?? DATE_RANGES[0];
    const [key, value] = query.split('=');
    if (key === 'allTime') return { allTime: true };
    if (key === 'daysBack') return { daysBack: Number(value) };
    return { monthsBack: Number(value) };
}

/** Widen the quick date range by two steps (14d → 3m, 30d → 6m, …), clamped at the widest. */
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
 * Search-dropdown filters. cityIds / bodyTypes / dates are server-applied (/api/map/subjects);
 * minDuration is client-applied since discussion time is computed per subject after the query.
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
 * The map-center municipality lookup (/api/cities/at) re-fires only when the center moves more
 * than this fraction of the viewport, so pure zoom and tiny pans skip it. Scales with viewport.
 */
export const CENTER_QUERY_MOVE_RATIO = 0.2;

/**
 * Subjects in view at or above which pins drop to plain topic-coloured dots. Fewer than this and the
 * map keeps the icon badges; past it the icons are touching anyway, so the badge shape stops
 * carrying information and only costs legibility (and a React root each) — the colour still reads.
 */
export const SUBJECT_DOT_THRESHOLD = 150;

/** An HTML map marker handle: a subject icon badge (`subject` set) or a cluster count circle (null). */
export type SubjectPin = {
    el: HTMLButtonElement;
    rootEl: HTMLDivElement;
    root: Root | null;
    marker: mapboxgl.Marker;
    subject: LandingSubject | null;
    /** drawn as a bare dot (dense viewport) — kept so the selection restyle keeps the same shape */
    dot: boolean;
};

/**
 * Styles a map pin like the TopicChip badge, minus the label. Styling goes on the inner button
 * (Mapbox owns the root's transform); only z-index touches the root.
 *
 * `dot` is the dense-viewport shape: the same circle, minus the icon and at a fraction of the size.
 * Only the size differs — the fill, ring and selected treatment all come from the shared colour
 * block below, so a dot reads as a small pin rather than a different kind of marker. It has to live
 * here rather than only in the factory so the selection restyle keeps a dot a dot: pins are rebuilt
 * on viewport change, not on selection, so a dot that restyled into a full badge would have no icon
 * inside it.
 */
export function stylePin(
    { el, rootEl }: { el: HTMLButtonElement; rootEl: HTMLDivElement },
    subject: LandingSubject,
    selected: boolean,
    /** the "intense" fill (category colour bg + white icon) — the mobile preview and mobile
     *  selected pins both use it (the pin icon is rendered with currentColor, so el.style.color
     *  drives it). */
    intense = false,
    dot = false,
) {
    // Same recipe as <TopicIcon> — see @/lib/topicStyle for why the soft icon is darkened.
    const { background, border, icon } = topicStyle(subject.topic.color, intense ? 'solid' : 'soft');
    el.className = cn(
        'flex cursor-pointer items-center justify-center rounded-full border shadow-md transition-transform',
        // A dot ignores `hot` — at this density the extra size would just read as noise.
        dot ? (intense ? 'h-4 w-4' : 'h-3 w-3') : subject.hot ? 'h-9 w-9' : 'h-7 w-7',
        (selected || intense) && 'scale-110',
    );
    // the pin icon renders with currentColor, so `el.style.color` drives it
    el.style.color = icon;
    el.style.backgroundColor = background;
    el.style.borderColor = border;
    el.style.borderWidth = intense ? '2px' : '1px';
    rootEl.style.zIndex = selected || intense ? '2' : subject.hot ? '1' : '0';
}

/**
 * Center the map on a municipality's geometry, offset right of center to clear the desktop
 * floating list. Fits the whole δήμος when it has bounds; falls back to easeTo for a bare Point.
 */
export function flyToMunicipality(map: mapboxgl.Map, geometry: GeoJSON.Geometry, isMobile: boolean, minZoom?: number) {
    const { bounds, center } = calculateGeometryBounds(geometry);
    // desktop: shift right of center, but less than a subject focus (which uses 210)
    const offset: [number, number] = isMobile ? [0, 0] : [120, 0];
    if (bounds) {
        if (minZoom != null) {
            const fit = map.cameraForBounds(
                [
                    [bounds.minLng, bounds.minLat],
                    [bounds.maxLng, bounds.maxLat],
                ],
                { padding: isMobile ? 120 : 80, maxZoom: 17 },
            );
            map.easeTo({ center, zoom: fit?.zoom != null ? Math.max(fit.zoom, minZoom) : minZoom, offset, duration: 600 });
            return;
        }
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

/** View mode — drives the aside panel content and the map's marker layer.
 *  'home' = intro panel; 'subjects' = subjects list + pins; 'municipalities' = δήμοι + logo markers. */
export type LandingView = 'home' | 'subjects' | 'municipalities';

/** Map the shared view onto the desktop tab set: desktop has no 'home', so it collapses to 'subjects'. */
export function desktopView(view: LandingView): LandingView {
    return view === 'home' ? 'subjects' : view;
}

/** The selection + filters restored from the URL on first mount. */
export type InitialUrlState = {
    selectedId: string | null;
    view: LandingView;
    /** the "?" help drawer is open — encoded as `?view=help` (over the subjects map). */
    infoOpen: boolean;
    cats: string[];
    query: string;
    range: DateRangeKey;
    filters: MapFilters;
};

/**
 * Resolve the initial landing state from the URL (run once on mount). `?subject=` forces the
 * 'subjects' view; `?view=help` opens the help drawer over the subjects map; range defaults to
 * DEFAULT_RANGE (so a shared subject older than 3 months won't pre-select) unless the URL pins one.
 */
export function parseInitialUrlState(search: string): InitialUrlState {
    const p = new URLSearchParams(search);
    const subject = p.get('subject');

    const viewParam = p.get('view');
    // `view=help` isn't a map view — it opens the help drawer over the subjects map.
    const infoOpen = !subject && viewParam === 'help';
    let view: LandingView;
    if (subject) view = 'subjects';
    else if (viewParam === 'home' || viewParam === 'subjects' || viewParam === 'municipalities') view = viewParam;
    else view = 'subjects';

    const catParam = p.get('cat');
    const cats = catParam ? catParam.split(',').filter(Boolean) : [];
    const query = p.get('q') ?? '';

    const r = p.get('range');
    const range: DateRangeKey = r && DATE_RANGES.some((d) => d.key === r) ? (r as DateRangeKey) : DEFAULT_RANGE;

    const city = p.get('city');
    const body = p.get('body');
    const from = p.get('from');
    const to = p.get('to');
    // The discussion-duration filter has no UI anymore; ignore a legacy `dur=` param so it can't
    // silently apply an invisible, unclearable constraint from a shared/restored URL.
    const filters: MapFilters =
        city || body || from || to
            ? {
                  cityIds: city ? [city] : [],
                  bodyTypes: body ? body.split(',').filter(Boolean) : [],
                  dateFrom: from || null,
                  dateTo: to || null,
                  minDuration: null,
              }
            : EMPTY_FILTERS;

    return { selectedId: subject, view, infoOpen, cats, query, range, filters };
}

/** Props shared by the desktop and mobile layouts. */
export type LayoutProps = {
    /** desktop view mode (drives the aside nav/body and the map's marker layer) */
    view: LandingView;
    setView: (v: LandingView) => void;
    /** the "?" info/help drawer is open — independent of the map view (doesn't change markers) */
    infoOpen: boolean;
    onToggleInfo: () => void;
    /** selected category (topic) ids — empty means "all" */
    cats: string[];
    /** toggle a category in/out of the selection (also clears any selected subject) */
    onToggleCat: (id: string) => void;
    /** replace the whole category selection (mobile filter sheet "apply") */
    setCats: (ids: string[]) => void;
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
    cities: LandingListCity[];
    /** unfiltered total subjects per cityId (for the Δήμοι tab stats) */
    subjectCountByCity: Record<string, number>;
    upcoming: UpcomingMeeting[];
    loading: boolean;
    selectedId: string | null;
    /** `source` feeds the subject_selected analytics event; defaults to 'list' */
    selectSubject: (id: string, source?: 'list' | 'search') => void;
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
    /** the last "locate me" attempt failed → show an error tooltip by the locate control */
    geoError: boolean;
    /** dismiss the geolocation error tooltip */
    onDismissGeoError: () => void;
    /** geocode a typed address query and fly the map to it */
    onLocateAddress: (q: string) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    /** the map is in the zoomed-out municipality overview (cluster numbers, no subject detail) — mobile
     *  keeps the subjects list collapsed while true and opens it on drilling into a δήμος */
    overviewActive: boolean;
    /** mobile: the previewed subject (tapped on the map) — highlighted + brought to the strip's front */
    previewId: string | null;
    /** mobile: set the previewed subject (first tap on a strip card previews; null clears) */
    previewSubject: (id: string | null) => void;
    /** Mobile: the OpenCouncil badge's card preview is open. */
    explainOpen: boolean;
    onCloseExplain: () => void;
    /** The municipality shown on the map (clicked or filter-selected) — for its page link.
     *  nameMunicipality is the genitive form (e.g. "Δήμος Χανίων"). */
    displayedMunicipality: { id: string; name: string; nameMunicipality: string } | null;
    mapNode: ReactNode;
};
