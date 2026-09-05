'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import type { Root } from 'react-dom/client';
import type { LatLng } from '@/lib/google-maps';
import {
    CENTER_QUERY_MOVE_RATIO,
    SUBJECT_DOT_THRESHOLD,
    SUBJECT_FOCUS_ZOOM,
    nextDotMode,
    stylePin,
    type SubjectPin,
} from '@/lib/landing/landingCore';
import {
    groupByLocation,
    subjectInViewport,
    type CenterMunicipality,
    type LandingMapCity,
    type LandingPetitionedCity,
    type CoLocatedBox,
    type GeneralBox,
    type LandingGeneralCity,
    type LandingSubject,
    type MapViewport,
    type MunicipalitySubjectCount,
} from '@/lib/landing/landingData';
import {
    buildSubjectPins,
    createGeneralCityMarker,
    createMunicipalityCountMarker,
    createMunicipalityViewMarker,
    DONUT_INK_HEIGHT,
    DONUT_INK_WIDTH,
    MUNICIPALITY_VIEW_MARKER_DIAMETER,
    MUNICIPALITY_VIEW_MARKER_RING_SPREAD,
} from '../mapMarkers';
import { captureMapAction, type MapSurface } from '@/lib/analytics/capture';
import {
    packMunicipalityMarkers,
    type MarkerExtent,
    type MarkerPlacement,
    type PackMemory,
    type Point,
} from '@/lib/landing/markerDeclutter';
import { MUNICIPALITY_SATELLITE_SCALE } from '@/lib/landing/donut';
import type { CityAtPoint } from "@/lib/db/cities";

/**
 * Capture the map view on every moveend so the list reacts to it. Resolves the municipality under
 * the center; finishes a pending co-located / city-hall pan by opening its box; otherwise closes the
 * boxes and publishes the new viewport. Selection pans set `suppressViewCapture` to skip refiltering.
 */
export function useMapViewCapture({
    mapInstance,
    surface = 'landing',
    suppressViewCaptureRef,
    pendingCoLocatedRef,
    pendingGeneralRef,
    setMapZoom,
    setCenterMunicipality,
    setCoLocated,
    setGeneralBox,
    setMapView,
    onUserNavigate,
}: {
    mapInstance: MapboxMap | null;
    /** Which page the map runs on — off-landing the events leave the landing_* family. */
    surface?: MapSurface;
    suppressViewCaptureRef: MutableRefObject<boolean>;
    pendingCoLocatedRef: MutableRefObject<LandingSubject[] | null>;
    pendingGeneralRef: MutableRefObject<LandingGeneralCity | null>;
    setMapZoom: (v: number) => void;
    /** Resolve the δήμος under the center on every meaningful move. Omitted by a map whose
     *  δήμος is fixed — then no /api/cities/at call is made at all. */
    setCenterMunicipality?: (v: CenterMunicipality | null) => void;
    setCoLocated: (v: CoLocatedBox | null) => void;
    setGeneralBox: (v: GeneralBox | null) => void;
    setMapView: (v: MapViewport) => void;
    /** fired on a genuine user pan/zoom (not a suppressed programmatic move) */
    onUserNavigate?: () => void;
}) {
    const centerReqRef = useRef(0);
    // Center of the last /api/cities/at query — the gate below re-queries only after the
    // center moves a meaningful fraction of the viewport away.
    const lastCenterQueryRef = useRef<LatLng | null>(null);
    useEffect(() => {
        if (!mapInstance) return;
        const capture = () => {
            setMapZoom(mapInstance.getZoom());

            const center = mapInstance.getCenter();
            const bounds = mapInstance.getBounds();
            // Municipality under the center → drives the "view its page" button. Skip the lookup
            // unless the center moved > CENTER_QUERY_MOVE_RATIO of the viewport since the last
            // query, so a pure zoom or tiny pan makes no network call. Threshold scales with zoom.
            if (bounds && setCenterMunicipality) {
                const spanLng = Math.abs(bounds.getEast() - bounds.getWest());
                const spanLat = Math.abs(bounds.getNorth() - bounds.getSouth());
                const last = lastCenterQueryRef.current;
                const movedEnough =
                    !last ||
                    Math.abs(center.lng - last.lng) > spanLng * CENTER_QUERY_MOVE_RATIO ||
                    Math.abs(center.lat - last.lat) > spanLat * CENTER_QUERY_MOVE_RATIO;
                if (movedEnough) {
                    lastCenterQueryRef.current = { lng: center.lng, lat: center.lat };
                    const reqId = ++centerReqRef.current;
                    fetch(`/api/cities/at?lng=${center.lng}&lat=${center.lat}`)
                        .then((r) => (r.ok ? r.json() : null))
                        .catch(() => null)
                        .then((city: Pick<CityAtPoint, 'id' | 'name' | 'name_municipality' | 'status'> | null) => {
                            if (reqId === centerReqRef.current) {
                                setCenterMunicipality(
                                    city
                                        ? {
                                              id: city.id,
                                              name: city.name,
                                              nameMunicipality: city.name_municipality,
                                              status: city.status,
                                          }
                                        : null,
                                );
                            }
                        });
                }
            }
            // a "+N" pan finished → open the box at the now-centered point
            if (pendingCoLocatedRef.current) {
                const group = pendingCoLocatedRef.current;
                pendingCoLocatedRef.current = null;
                suppressViewCaptureRef.current = false;
                const p = mapInstance.project([group[0].lng, group[0].lat]);
                setCoLocated({ subjects: group, x: p.x, y: p.y });
                return;
            }
            // a city-hall pan finished → open the general box at the now-centered centroid
            if (pendingGeneralRef.current) {
                const city = pendingGeneralRef.current;
                pendingGeneralRef.current = null;
                suppressViewCaptureRef.current = false;
                const p = mapInstance.project([city.lng, city.lat]);
                setGeneralBox({ city, x: p.x, y: p.y });
                return;
            }
            // any other move closes the box(es)
            setCoLocated(null);
            setGeneralBox(null);
            // a selection pan holds back the list-driving view so the list stays put
            if (suppressViewCaptureRef.current) {
                suppressViewCaptureRef.current = false;
                return;
            }
            // a genuine user pan/zoom — drop any strip preview
            onUserNavigate?.();
            if (!bounds) return;
            setMapView({
                w: bounds.getWest(),
                s: bounds.getSouth(),
                e: bounds.getEast(),
                n: bounds.getNorth(),
                clng: center.lng,
                clat: center.lat,
            });
        };
        capture();
        mapInstance.on('moveend', capture);

        // Analytics: one debounced map_moved per exploration burst (kind + zoom level only —
        // no coordinates). User-initiated moves only: dragend is always a user gesture, and a
        // zoomend carries originalEvent only for wheel/pinch/dblclick (programmatic easeTo/flyTo
        // and the +/- buttons, which are tracked separately as map_zoom, don't).
        let moveDebounce: ReturnType<typeof setTimeout> | null = null;
        let movedKind: 'zoom' | 'pan' | null = null;
        const queueMoveCapture = (kind: 'zoom' | 'pan') => {
            movedKind = kind === 'zoom' ? 'zoom' : movedKind ?? 'pan'; // zoom wins over pan in a burst
            if (moveDebounce) clearTimeout(moveDebounce);
            moveDebounce = setTimeout(() => {
                captureMapAction(surface, 'map_moved', { kind: movedKind, zoom: Math.round(mapInstance.getZoom()) });
                movedKind = null;
            }, 1000);
        };
        const onDragEnd = () => queueMoveCapture('pan');
        // mapbox-gl's zoomend typing omits originalEvent, but the runtime event carries it
        // for gesture zooms (wheel/pinch/dblclick) and omits it for programmatic ones.
        const onZoomEnd = (e: object) => {
            if ((e as { originalEvent?: unknown }).originalEvent) queueMoveCapture('zoom');
        };
        mapInstance.on('dragend', onDragEnd);
        mapInstance.on('zoomend', onZoomEnd);

        return () => {
            mapInstance.off('moveend', capture);
            mapInstance.off('dragend', onDragEnd);
            mapInstance.off('zoomend', onZoomEnd);
            if (moveDebounce) clearTimeout(moveDebounce);
        };
        // setters + refs are stable; re-subscribe only when the map instance changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance]);
}

/**
 * Build the subject pins for the current viewport and keep them in sync. Co-located subjects merge
 * into a "+N" marker; the selected subject keeps its own highlighted pin (see buildSubjectPins).
 * A separate effect restyles pins on selection.
 */
export function useSubjectMarkers({
    mapInstance,
    surface = 'landing',
    active,
    visibleSubjects,
    selectedId,
    previewId,
    onSelect,
    onClearSelection,
    suppressViewCaptureRef,
    pendingCoLocatedRef,
    setCoLocated,
}: {
    mapInstance: MapboxMap | null;
    /** Which page the map runs on — off-landing the events leave the landing_* family. */
    surface?: MapSurface;
    /** gates the whole layer — off while the zoomed-out δήμος donuts have the map */
    active: boolean;
    visibleSubjects: LandingSubject[];
    selectedId: string | null;
    /** the mobile strip's previewed subject — its pin gets the intense filled style */
    previewId: string | null;
    onSelect: (id: string) => void;
    onClearSelection: () => void;
    suppressViewCaptureRef: MutableRefObject<boolean>;
    pendingCoLocatedRef: MutableRefObject<LandingSubject[] | null>;
    setCoLocated: (v: CoLocatedBox | null) => void;
}) {
    const pinsRef = useRef<SubjectPin[]>([]);
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;
    const previewIdRef = useRef(previewId);
    previewIdRef.current = previewId;
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onClearSelectionRef = useRef(onClearSelection);
    onClearSelectionRef.current = onClearSelection;
    // t is ref'd so the marker-building effect doesn't re-run on every render
    const t = useTranslations('landingV2');
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        if (!mapInstance || !active) return;

        const openCoLocated = (group: LandingSubject[]) => {
            captureMapAction(surface, 'cluster_opened', { kind: 'co_located', size: group.length });
            // opening a "+N" box deselects any subject so its preview closes
            onClearSelectionRef.current();
            const lng = group[0].lng;
            const lat = group[0].lat;
            const c = mapInstance.getCenter();
            // Focus like a single-pin selection (selectSubject): center AND zoom in. A zoom delta
            // counts as movement so an already-centered point still eases in (and fires moveend).
            const targetZoom = Math.max(mapInstance.getZoom(), SUBJECT_FOCUS_ZOOM);
            const willMove =
                Math.abs(c.lng - lng) > 1e-6 ||
                Math.abs(c.lat - lat) > 1e-6 ||
                Math.abs(mapInstance.getZoom() - targetZoom) > 1e-3;
            if (willMove) {
                // center + zoom the location; the box opens after the pan
                suppressViewCaptureRef.current = true;
                pendingCoLocatedRef.current = group;
                mapInstance.easeTo({ center: [lng, lat], zoom: targetZoom, duration: 400 });
            } else {
                const p = mapInstance.project([lng, lat]);
                setCoLocated({ subjects: group, x: p.x, y: p.y });
            }
        };

        // Crowded viewport → the pins drop to plain topic-coloured dots. Counted over the subjects
        // actually on screen right now (`visibleSubjects` is filter-scoped, so it holds off-screen
        // subjects too). Re-evaluated live on every frame of a pan/zoom — the flip is applied to
        // the existing pins in place (a CSS-transitioned morph, see SubjectPin.setDot), never by
        // rebuilding the layer. The exit threshold sits below the entry one so a count hovering at
        // the boundary can't flap the whole layer between shapes mid-gesture.
        const countInView = () => {
            const b = mapInstance.getBounds();
            if (!b) return visibleSubjects.length;
            const vp = { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() };
            // This runs on every frame of a pan/zoom, so stop counting at the entry threshold:
            // both mode decisions only compare against thresholds at or below it, and a dense
            // viewport (the common case for large filter sets) exits after ~150 hits.
            let n = 0;
            for (const s of visibleSubjects) {
                if (subjectInViewport(s, vp) && ++n >= SUBJECT_DOT_THRESHOLD) break;
            }
            return n;
        };
        let dotMode = countInView() >= SUBJECT_DOT_THRESHOLD;

        const pins = buildSubjectPins(mapInstance, groupByLocation(visibleSubjects), {
            selectedId: selectedIdRef.current,
            previewId: previewIdRef.current,
            dot: dotMode,
            onSelect: (id) => onSelectRef.current(id),
            onOpenCoLocated: openCoLocated,
            t: tRef.current,
        });
        pinsRef.current = pins;

        const syncDotMode = () => {
            const n = countInView();
            const next = nextDotMode(n, dotMode);
            if (next === dotMode) return;
            dotMode = next;
            pins.forEach((pin) => pin.setDot(next, selectedIdRef.current, previewIdRef.current));
        };
        // rAF-coalesced so a burst of move events costs one count per frame; 'move' rather than
        // 'zoom' because panning changes what's in the viewport too.
        let frame = 0;
        const onMove = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                syncDotMode();
            });
        };
        mapInstance.on('move', onMove);
        mapInstance.on('moveend', syncDotMode);

        return () => {
            if (frame) cancelAnimationFrame(frame);
            mapInstance.off('move', onMove);
            mapInstance.off('moveend', syncDotMode);
            pinsRef.current = [];
            pins.forEach(({ marker, root }) => {
                marker.remove();
                // unmount async — React forbids unmounting a root mid-commit
                if (root) setTimeout(() => root.unmount(), 0);
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, visibleSubjects, active]);

    // Selection / strip-preview restyle the existing subject markers in place (no rebuild). The
    // selected pin and the mobile strip's previewed pin both get the intense filled style (previewId
    // is only ever set on mobile, so this reads the same on both viewports).
    useEffect(() => {
        pinsRef.current.forEach((pin) => {
            if (!pin.subject) return;
            const selected = pin.subject.id === selectedId;
            const intense = selected || pin.subject.id === previewId;
            stylePin(pin, pin.subject, selected, intense, pin.dot);
        });
    }, [selectedId, previewId]);
}

/**
 * City-hall markers: one per municipality with non-located subjects in view. Clicking one
 * clears the other map previews and opens that δήμος's GeneralSubjectsBox after a centering pan.
 */
export function useGeneralCityMarkers({
    mapInstance,
    surface = 'landing',
    active,
    visibleGeneralCities,
    isMobile,
    onClearSelection,
    closeExplainPopupRef,
    suppressViewCaptureRef,
    pendingGeneralRef,
    setExplainOpen,
    setClickedMunicipality,
    setCoLocated,
    setGeneralBox,
}: {
    mapInstance: MapboxMap | null;
    /** Which page the map runs on — off-landing the events leave the landing_* family. */
    surface?: MapSurface;
    /** gates the whole layer — off while the zoomed-out δήμος donuts have the map */
    active: boolean;
    visibleGeneralCities: LandingGeneralCity[];
    isMobile: boolean;
    onClearSelection: () => void;
    closeExplainPopupRef: MutableRefObject<(() => void) | null>;
    suppressViewCaptureRef: MutableRefObject<boolean>;
    pendingGeneralRef: MutableRefObject<LandingGeneralCity | null>;
    setExplainOpen: (v: boolean) => void;
    setClickedMunicipality: (v: null) => void;
    setCoLocated: (v: CoLocatedBox | null) => void;
    setGeneralBox: (v: GeneralBox | null) => void;
}) {
    const onClearSelectionRef = useRef(onClearSelection);
    onClearSelectionRef.current = onClearSelection;
    const isMobileRef = useRef(isMobile);
    isMobileRef.current = isMobile;
    const t = useTranslations('landingV2');
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        if (!mapInstance || !active) return;
        const markers: { marker: Marker; root: Root }[] = [];
        for (const city of visibleGeneralCities) {
            const { marker, root } = createGeneralCityMarker(mapInstance, city, () => {
                captureMapAction(surface, 'cluster_opened', { kind: 'city_hall', size: city.subjects.length, city_id: city.cityId });
                // opening the general box clears the other map previews
                onClearSelectionRef.current();
                closeExplainPopupRef.current?.();
                setExplainOpen(false);
                setClickedMunicipality(null);
                setCoLocated(null);
                const c = mapInstance.getCenter();
                // Only centre on the centroid — keep the current zoom (no zoom-in); the box opens
                // after the pan.
                const willMove = Math.abs(c.lng - city.lng) > 1e-6 || Math.abs(c.lat - city.lat) > 1e-6;
                if (willMove) {
                    // centre the centroid without zooming. desktop: shift right to clear the floating
                    // list. mobile: drop below center to clear the top controls.
                    suppressViewCaptureRef.current = true;
                    pendingGeneralRef.current = city;
                    mapInstance.easeTo({
                        center: [city.lng, city.lat],
                        duration: 400,
                        offset: isMobileRef.current ? [0, 120] : [210, 100],
                    });
                } else {
                    const p = mapInstance.project([city.lng, city.lat]);
                    setGeneralBox({ city, x: p.x, y: p.y });
                }
            }, tRef.current);
            markers.push({ marker, root });
        }
        return () => {
            markers.forEach(({ marker, root }) => {
                marker.remove();
                // unmount async — React forbids unmounting a root mid-commit
                setTimeout(() => root.unmount(), 0);
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, visibleGeneralCities, active]);
}

// The ink ellipse of a full-size donut: half a ring plus a hairline across (so adjacent rings
// touch without their strokes merging), ring-plus-count down. The marker element IS this box,
// centred on the anchor (see createMunicipalityCountMarker), so the extent carries no ink drop.
// Fixed px — the donuts are a fixed size, so only the distance between their anchors changes
// with zoom.
const MUNICIPALITY_MARKER_EXTENT = {
    rx: DONUT_INK_WIDTH / 2,
    ry: DONUT_INK_HEIGHT / 2,
    cy: 0,
};


/**
 * Per-δήμος count labels for the zoomed-out view (see MUNICIPALITY_COUNT_MAX_ZOOM). `active` gates the
 * whole layer so it swaps cleanly with the pin/donut layer as the map crosses the zoom threshold.
 *
 * Every δήμος draws its own logo + ring + number — the same marker meaning the same thing at every
 * zoom. Neighbours are never merged into a combined total and none are hidden. Far out their
 * centroids project close enough that the donuts would pile up, so each pile packs into a bubble
 * cluster instead: the busiest δήμος anchors it full-size on its real spot, the rest shrink a step
 * and pack touching it (see packMunicipalityMarkers), and it all unwinds as zooming in pulls the
 * real positions apart.
 *
 * The packing is a pure function of the projection, and it's translation-invariant — panning moves
 * the geo-anchored markers natively and never changes the layout. Only zoom changes it, so the
 * layout is recomputed live during zoom (rAF-coalesced 'zoom' events, with a 'moveend' backstop),
 * not just when the gesture ends. The markers themselves are built once per counts change and only
 * repositioned/rescaled.
 */
export function useMunicipalityCountMarkers({
    mapInstance,
    active,
    municipalityCounts,
    onZoomToCity,
}: {
    mapInstance: MapboxMap | null;
    active: boolean;
    municipalityCounts: MunicipalitySubjectCount[];
    onZoomToCity: (muni: MunicipalitySubjectCount) => void;
}) {
    const t = useTranslations('landingV2');
    const tRef = useRef(t);
    tRef.current = t;
    const onZoomRef = useRef(onZoomToCity);
    onZoomRef.current = onZoomToCity;

    useEffect(() => {
        if (!mapInstance || !active) return;
        const municipalities = municipalityCounts;

        // The packing is a pure function of where the centroids currently project, so it's
        // recomputed as the projection changes — but that's all that changes. The donut SVG, logo
        // and count depend only on `municipalityCounts` (this effect's dep), so the markers are
        // built once here and repositioned/rescaled, never torn down and rebuilt on pan/zoom.
        const computePlacements = createPackPlanner(
            () => municipalities.map((m) => mapInstance.project([m.lng, m.lat])),
            municipalities.map((m) => m.count),
            MUNICIPALITY_MARKER_EXTENT,
            MUNICIPALITY_SATELLITE_SCALE,
        );

        const initial = computePlacements();
        const markers = municipalities.map((muni, i) =>
            createMunicipalityCountMarker(
                mapInstance,
                muni,
                (m) => onZoomRef.current(m),
                tRef.current,
                [initial[i].offset.x, initial[i].offset.y],
                initial[i].scale,
            ),
        );

        const reposition = () => {
            const placements = computePlacements();
            markers.forEach((m, i) => m.setPlacement([placements[i].offset.x, placements[i].offset.y], placements[i].scale));
        };
        const detach = attachLiveRepack(mapInstance, reposition);

        return () => {
            detach();
            markers.forEach((m) => {
                m.dispose();
                m.marker.remove();
            });
        };
    }, [mapInstance, active, municipalityCounts]);
}

/**
 * A layer's packing planner: projects the entries, packs them, and feeds each layout's discrete
 * choices back into the next (see PackMemory) so per-frame recomputation can't dither a satellite
 * between two spots mid-gesture. The memory-threading protocol lives here once, not per layer.
 */
function createPackPlanner(
    project: () => Point[],
    priorities: number[],
    extent: MarkerExtent,
    satelliteScale: number,
): () => MarkerPlacement[] {
    let memory: PackMemory[] | undefined;
    return () => {
        const result = packMunicipalityMarkers(project(), priorities, extent, satelliteScale, memory);
        memory = result.memory;
        return result.placements;
    };
}

/** How often a packed layer recomputes its layout during a zoom gesture. The repack is ~O(n²)
 *  (measured ~9ms at n=60), so it must not run per frame; the marker shells ease toward the last
 *  targets at frame rate regardless (see packedMarkerShell), so a coarser target cadence stays
 *  visually smooth. */
const REPACK_MIN_INTERVAL_MS = 100;

/**
 * Live layout for a packed marker layer: the packing only ever changes with zoom (it's
 * translation-invariant, and pitch/rotation are disabled on the landing map), so 'zoom' — which
 * fires every animation frame of a wheel/pinch/easeTo — is the one signal that matters. Repacks
 * are rAF-coalesced AND time-gated to REPACK_MIN_INTERVAL_MS — the shells' easing carries the
 * motion between targets — with an ungated 'moveend' pass so every gesture settles on an exact
 * final layout. Returns the detach function.
 */
function attachLiveRepack(map: MapboxMap, reposition: () => void): () => void {
    let frame = 0;
    let lastPack = 0;
    const onZoom = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            const now = performance.now();
            // Skipped ticks need no retry: 'zoom' keeps firing while the gesture continues, and
            // the trailing end is covered by the moveend pass below.
            if (now - lastPack < REPACK_MIN_INTERVAL_MS) return;
            lastPack = now;
            reposition();
        });
    };
    const onMoveEnd = () => {
        lastPack = performance.now();
        reposition();
    };
    map.on('zoom', onZoom);
    map.on('moveend', onMoveEnd);
    return () => {
        if (frame) cancelAnimationFrame(frame);
        map.off('zoom', onZoom);
        map.off('moveend', onMoveEnd);
    };
}

// The Δήμοι-view bubbles are plain circles (no count hanging below), so their ink extent is the
// disc plus the ring drawn around it as box-shadow (MUNICIPALITY_VIEW_MARKER_RING_SPREAD) —
// shadows paint outside the element box, so ignoring them held rings overlapping while the discs
// "touched".
const MUNICIPALITY_VIEW_EXTENT = {
    rx: MUNICIPALITY_VIEW_MARKER_DIAMETER / 2 + MUNICIPALITY_VIEW_MARKER_RING_SPREAD,
    ry: MUNICIPALITY_VIEW_MARKER_DIAMETER / 2 + MUNICIPALITY_VIEW_MARKER_RING_SPREAD,
    cy: 0,
};

/**
 * The Δήμοι view's marker layer: one logo bubble per cooperating municipality — no counts and no
 * topic rings, this view is about the δήμοι themselves — plus a brand-blue bubble for every
 * out-of-network municipality with enough petitions, coloured deeper the higher it sits in the
 * petition distribution. Both kinds pack with the same live bubble-cluster logic as the count
 * donuts (busiest-anchored, azimuth-true, hysteresis + transitions); cooperating δήμοι always
 * outrank petitioned ones for the anchor spot.
 */
export function useMunicipalitiesViewMarkers({
    mapInstance,
    active,
    mapCities,
    petitionedCities,
    subjectCountByCity,
    onOpenCity,
    onOpenPetitioned,
}: {
    mapInstance: MapboxMap | null;
    /** gates the whole layer — on only while the Δήμοι view has the map */
    active: boolean;
    mapCities: LandingMapCity[];
    petitionedCities: LandingPetitionedCity[];
    /** unfiltered totals per δήμος — the packing priority among cooperating municipalities */
    subjectCountByCity: Record<string, number>;
    onOpenCity: (city: LandingMapCity) => void;
    onOpenPetitioned: (city: LandingPetitionedCity) => void;
}) {
    const t = useTranslations('landingV2');
    const tRef = useRef(t);
    tRef.current = t;
    const onOpenCityRef = useRef(onOpenCity);
    onOpenCityRef.current = onOpenCity;
    const onOpenPetitionedRef = useRef(onOpenPetitioned);
    onOpenPetitionedRef.current = onOpenPetitioned;

    useEffect(() => {
        if (!mapInstance || !active) return;

        // One packed set: cooperating δήμοι first, then the petition layer. Priorities keep every
        // cooperating δήμος above every petitioned one (a cluster's anchor should always be a real
        // OpenCouncil municipality), ordered by subject volume / petition intensity within each.
        // A petitioned δήμος without a boundary has no centroid — it lives on the leaderboard
        // only, never on the map.
        const entries = [
            ...mapCities.map((c) => ({
                kind: 'city' as const,
                city: c,
                lng: c.lng,
                lat: c.lat,
                priority: 1_000_000 + (subjectCountByCity[c.id] ?? 0),
            })),
            ...petitionedCities
                .filter((c) => c.lng != null && c.lat != null)
                .map((c) => ({
                    kind: 'petitioned' as const,
                    city: c,
                    lng: c.lng!,
                    lat: c.lat!,
                    priority: c.intensity * 1000,
                })),
        ];

        const computePlacements = createPackPlanner(
            () => entries.map((e) => mapInstance.project([e.lng, e.lat])),
            entries.map((e) => e.priority),
            MUNICIPALITY_VIEW_EXTENT,
            MUNICIPALITY_SATELLITE_SCALE,
        );

        const initial = computePlacements();
        const markers = entries.map((entry, i) =>
            createMunicipalityViewMarker(
                mapInstance,
                entry.kind === 'city'
                    ? {
                          name: entry.city.name,
                          nameMunicipality: entry.city.nameMunicipality,
                          lng: entry.lng,
                          lat: entry.lat,
                          logoImage: entry.city.logoImage,
                      }
                    : {
                          name: entry.city.name,
                          nameMunicipality: entry.city.nameMunicipality,
                          lng: entry.lng,
                          lat: entry.lat,
                          logoImage: entry.city.logoImage,
                          petition: { intensity: entry.city.intensity },
                      },
                () =>
                    entry.kind === 'city'
                        ? onOpenCityRef.current(entry.city)
                        : onOpenPetitionedRef.current(entry.city),
                entry.kind === 'city'
                    ? entry.city.nameMunicipality
                    : tRef.current('marker.petitionedAria', {
                          name: entry.city.nameMunicipality,
                          count: entry.city.bucket,
                      }),
                [initial[i].offset.x, initial[i].offset.y],
                initial[i].scale,
            ),
        );

        const reposition = () => {
            const placements = computePlacements();
            markers.forEach((m, i) => m.setPlacement([placements[i].offset.x, placements[i].offset.y], placements[i].scale));
        };
        const detach = attachLiveRepack(mapInstance, reposition);

        return () => {
            detach();
            markers.forEach((m) => {
                m.dispose();
                m.marker.remove();
            });
        };
    }, [mapInstance, active, mapCities, petitionedCities, subjectCountByCity]);
}
