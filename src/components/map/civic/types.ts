import type { MapMunicipality, MapSubject } from '@/lib/map/types';
import type { ViewportBounds } from '@/lib/map/viewport';
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX } from '@/lib/map/constants';

export interface CivicMapMarkerOptions {
    /** 'donut': nearby subjects merge into topic-segmented rings. 'none': every subject renders individually. */
    clusterMode: 'donut' | 'none';
    /** Scale pins by discussion intensity; minor (τυπικά) subjects render as small dots. */
    importanceScaling: boolean;
    clusterRadius: number;
    /** Clustering runs through this zoom; every subject renders individually from the next zoom up. */
    clusterMaxZoom: number;
    /** Fan out co-located subjects on click so each stays selectable. */
    spiderfy: boolean;
}

export const DEFAULT_MARKER_OPTIONS: CivicMapMarkerOptions = {
    clusterMode: 'donut',
    importanceScaling: true,
    clusterRadius: CLUSTER_RADIUS_PX,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    spiderfy: true,
};

export type CivicMapPadding = number | { top: number; bottom: number; left: number; right: number };

export interface CivicMapCamera {
    initialCenter?: [number, number];
    initialZoom?: number;
    /** Fit the viewport once loaded (re-fits when this value changes identity). */
    fitTo?: 'subjects' | GeoJSON.Geometry | null;
    /** Padding applied to programmatic camera moves (room for panels/drawers). */
    padding?: CivicMapPadding;
    maxZoom?: number;
    /** Sync camera to the URL hash (#zoom/lat/lng). At most one map per page. */
    urlHash?: boolean;
}

/** Imperative controls handed to the page via onMapReady. */
export interface CivicMapHandle {
    flyTo(center: [number, number], zoom?: number): void;
    fitGeometry(geometry: GeoJSON.Geometry, padding?: CivicMapPadding): void;
    getBounds(): ViewportBounds | null;
    zoomBy(delta: number): void;
    /** Update camera padding (e.g. when the mobile drawer snaps open). */
    setPadding(padding: CivicMapPadding): void;
}

export interface CivicMapProps {
    subjects: MapSubject[];
    municipalities?: MapMunicipality[];
    /** Context outline (e.g. the city boundary on meeting pages) — drawn quietly, not interactive. */
    contextBoundary?: GeoJSON.Geometry | null;

    markerOptions?: Partial<CivicMapMarkerOptions>;
    camera?: CivicMapCamera;

    /** false renders a decorative, non-interactive map. */
    interactive?: boolean;
    /** Require ctrl/cmd+scroll and two-finger pan — for embeds inside scrollable pages. */
    cooperativeGestures?: boolean;

    // Bidirectional selection/hover (panel <-> map)
    selectedSubjectId?: string | null;
    hoveredSubjectId?: string | null;
    onSubjectSelect?: (subject: MapSubject | null) => void;
    onSubjectHover?: (subjectId: string | null) => void;
    onMunicipalityClick?: (municipality: MapMunicipality) => void;
    /** Fly to the subject when selectedSubjectId changes from outside. Default true. */
    flyToSelected?: boolean;

    /** Reference point marker (address search / geolocate result). */
    highlightPoint?: [number, number] | null;

    /** Debounced ids of subjects whose anchor is inside the current viewport. */
    onVisibleSubjectsChange?: (ids: string[]) => void;
    onMoveEnd?: (view: { center: [number, number]; zoom: number; bounds: ViewportBounds }) => void;
    /** Imperative escape hatch for page-level controls (geolocate, address search). */
    onMapReady?: (controls: CivicMapHandle) => void;

    /** Accessible label for the map region (pages pass a translated string). */
    ariaLabel?: string;
    /** Translated label builders for map-internal elements. */
    labels?: {
        /** aria-label for a donut cluster button, e.g. count => `${count} θέματα` */
        clusterAria?: (count: number) => string;
    };
    className?: string;
    /** Overlay content rendered above the map (chips, search, buttons). */
    children?: React.ReactNode;
}
